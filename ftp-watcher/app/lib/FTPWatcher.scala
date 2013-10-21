package lib

import java.nio.file.{Path, Files}
import java.io.InputStream

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.{process1, Process}
import scalaz.stream.Process._
import scalaz.stream.processes.resource


object FTPWatcher {

  import Processes._

  /** Produces a stream of `File`s, each exposing an `InputStream`.
    *
    * This stream is safe to use within the context of safe stream combinators, e.g. by sending it
    * to a `Sink`.
    *
    * The stream will be closed, and the file deleted from the server, once the `File` element
    * has been consumed.
    */
  def watchDir(host: String, user: String, password: String, dir: FilePath): Process[Task, File] = {
    val client = new Client
    val filePaths = resource(
      acquire = initClient(client, host, user, password, dir))(
      release = _ => client.quit)(
      step = _ => listFiles(client, emptySleep = 1000))
    filePaths |> unChunk >>= (path => retrieveFile(client, path).map(File(path, _)))
  }

  private def initClient(client: Client, host: String, user: String, password: String, dir: FilePath): Task[Unit] =
    client.connect(host, 21) >>
      client.login(user, password) >>
      client.cwd(dir) >>
      client.enterLocalPassiveMode >>
      client.setBinaryFileType

  private def listFiles(client: Client, emptySleep: Long, batchSize: Int = 10): Task[Seq[FilePath]] =
    client.listFiles.flatMap {
      case Nil   => sleep(emptySleep) >> listFiles(client, emptySleep)
      case files => Task.now(files.take(batchSize).map(_.getName))
    }

  private def retrieveFile(client: Client, file: FilePath): Process[Task, InputStream] =
    resource1(client.retrieveFile(file))(stream =>
      Task.delay(stream.close()) >> client.completePendingCommand >> client.delete(file))

  private def sleep(millis: Long): Task[Unit] = Task(Thread.sleep(millis))

}

case class File(name: FilePath, stream: InputStream)

object Processes {

  def resource1[O](acquire: Task[O])(release: O => Task[Unit]): Process[Task, O] =
    await(acquire)(o => emit(o) ++ suspend(eval(release(o))).drain)

  def unChunk[O]: Process1[Seq[O], O] =
    process1.id[Seq[O]].flatMap(emitAll)

}

object Sinks {

  import java.net.URI
  import org.apache.http.client.methods.HttpPost
  import org.apache.http.entity.InputStreamEntity
  import org.apache.http.impl.client.HttpClients

  def httpPost(uri: String): Sink[Task, File] =
    Process.constant { case File(_, in) =>
      Task {
        val client = HttpClients.createDefault
        val postReq = new HttpPost(uri)
        val entity = new InputStreamEntity(in)
        entity.setContentType("binary/octet-stream")
        entity.setChunked(true)
        postReq.setEntity(entity)
        client.execute(postReq).close()
        client.close()
      }
    }

  def saveToFile(parent: Path): Sink[Task, File] =
    Process.constant { case File(name, stream) =>
      Task {
        val path = parent.resolve(name)
        println(s"Saving $name to $path...")
        Files.copy(stream, path)
      }
    }

}
