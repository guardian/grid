package lib

import java.nio.file.{Path, Files}
import java.io.InputStream

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.Process
import scalaz.stream.Process._
import scalaz.stream.processes.resource


object FTPWatcher {

  def watchDir(host: String, user: String, password: String, dir: FilePath, emptySleep: Long): Process[Task, File] =
    resource(initClient(host, user, password, dir))(_.quit)(client =>
      listNextFile(client, emptySleep) map (client -> _))
      .flatMap { case (client, path) => retrieveFile(client, path).map(File(path, _)) }

  private def initClient(host: String, user: String, password: String, dir: FilePath): Task[Client] = {
    val client = new Client
    client.connect(host, 21) >>
      client.login(user, password) >>
      client.cwd(dir) >>
      client.setBinaryFileType >|
      client
  }

  private def listNextFile(client: Client, emptySleep: Long): Task[FilePath] =
    client.listFiles.flatMap(_.headOption.map(file => Task.now(file.getName))
      .getOrElse(sleep(emptySleep) >> listNextFile(client, emptySleep)))

  private def retrieveFile(client: Client, file: FilePath): Process[Task, InputStream] =
    Processes.resource1(client.retrieveFile(file))(
      stream => Task.delay(stream.close()) >> client.completePendingCommand >> client.delete(file))

  private def sleep(millis: Long): Task[Unit] = Task(Thread.sleep(millis))

}

case class File(name: FilePath, stream: InputStream)

object Processes {

  def resource1[O](acquire: Task[O])(release: O => Task[Unit]): Process[Task, O] =
    await(acquire)(o => emit(o) ++ suspend(eval(release(o))).drain)

}

object Sinks {

  def saveToFile(parent: Path): Sink[Task, File] =
    Process.constant { case File(name, stream) =>
      Task {
        val path = parent.resolve(name)
        println(s"Saving $name to $path...")
        Files.copy(stream, path)
      }
    }

}
