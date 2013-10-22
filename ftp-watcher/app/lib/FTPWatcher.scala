package lib

import java.nio.file.{Path, Files}
import java.io.InputStream

import org.apache.commons.net.ftp.FTPFile

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.{process1, Process}
import scalaz.stream.Process.{Process1, Sink, await, emit, suspend, eval, emitAll}
import scalaz.stream.processes.resource

import FTPWatcher._


class FTPWatcher(config: Config) {

  import Processes._

  /** Produces a stream of `File`s, each exposing an `InputStream`.
    *
    * This is unsafe to consume chunked, because the underlying client is not thread-safe.
    *
    * The stream will be closed, and the file deleted from the server, once the `File` element
    * has been consumed.
    */
  def watchDir: Process[Task, File] = {
    val client = new Client
    val filePaths = resource(
      acquire = initClient(client))(
      release = _ => client.quit)(
      step = _ => listFiles(client, emptySleep = 1000))
    filePaths
      .pipe(unChunk)
      .flatMap(file => retrieveFile(client, file.getName).map(stream => File(file.getName, file.getSize, stream)))
  }

  private def initClient(client: Client): Task[Unit] =
    client.connect(config.host, 21) >>
      client.login(config.user, config.password) >>
      client.cwd(config.dir) >>
      client.enterLocalPassiveMode >>
      client.setBinaryFileType

  private def listFiles(client: Client, emptySleep: Long, batchSize: Int = 10): Task[Seq[FTPFile]] =
    client.listFiles.flatMap {
      case Nil   => sleep(emptySleep) >> listFiles(client, emptySleep)
      case files => Task.now(files.take(batchSize))
    }

  private def retrieveFile(client: Client, file: FilePath): Process[Task, InputStream] =
    resource1(client.retrieveFile(file))(stream =>
      Task.delay(stream.close()) >> client.completePendingCommand >> client.delete(file))

}

object FTPWatcher {

  def apply(host: String, user: String, password: String, dir: FilePath): FTPWatcher =
    new FTPWatcher(Config(host, user, password, dir))

  case class Config(host: String, user: String, password: String, dir: FilePath)

  protected def sleep(millis: Long): Task[Unit] = Task(Thread.sleep(millis))
}

case class File(name: FilePath, size: Long, stream: InputStream)

object Processes {

  def resource1[O](acquire: Task[O])(release: O => Task[Unit]): Process[Task, O] =
    await(acquire)(o => emit(o) ++ suspend(eval(release(o))).drain)

  def unChunk[O]: Process1[Seq[O], O] =
    process1.id[Seq[O]].flatMap(emitAll)

}

object Sinks {

  import org.apache.http.client.methods.HttpPost
  import org.apache.http.entity.{ContentType, InputStreamEntity}
  import org.apache.http.impl.client.HttpClients

  def httpPost(uri: String): Sink[Task, File] =
    Process.constant { case File(_, length, in) =>
      Task {
        val client = HttpClients.createDefault
        val postReq = new HttpPost(uri)
        val entity = new InputStreamEntity(in, length, ContentType.DEFAULT_BINARY)
        postReq.setEntity(entity)
        client.execute(postReq).close()
        client.close()
      }
    }

  def saveToFile(parent: Path): Sink[Task, File] =
    Process.constant { case File(name, _, stream) =>
      Task {
        val path = parent.resolve(name)
        println(s"Saving $name to $path...")
        Files.copy(stream, path)
      }
    }

}
