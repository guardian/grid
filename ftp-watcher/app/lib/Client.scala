package lib

import java.io.{ByteArrayOutputStream, InputStream}
import org.apache.commons.net.ftp._
import scalaz.concurrent.Task
import java.util.concurrent.{Executors, ExecutorService}
import scala.concurrent.duration._

final class Client {

  private implicit val executor: ExecutorService = Executors.newCachedThreadPool

  private val client = new FTPClient
  client.setConnectTimeout(30.seconds.toMillis.toInt)
  client.setDefaultTimeout(30.seconds.toMillis.toInt)

  def connect(host: String, port: Int): Task[Unit] =
    Task { client.connect(host, port) }

  def login(user: String, password: String): Task[Boolean] =
    Task { client.login(user, password) }

  def pwd: Task[FilePath] =
    Task { client.printWorkingDirectory }

  def cwd(path: FilePath): Task[Boolean] =
    Task { client.changeWorkingDirectory(path) }

  def enterLocalPassiveMode: Task[Unit] =
    Task(client.enterLocalPassiveMode())

  def setBinaryFileType: Task[Unit] =
    Task(client.setFileType(FTP.BINARY_FILE_TYPE))

  def listFiles(path: FilePath): Task[List[FilePath]] =
    Task { client.listFiles(path, FileFilter).toList.map(_.getName) }

  def listDirectories(path: FilePath): Task[List[FilePath]] =
    Task { client.listFiles(path, FTPFileFilters.DIRECTORIES).toList.map(_.getName) }

  def retrieveFile(path: FilePath): Task[Array[Byte]] =
    Task {
      val out = new ByteArrayOutputStream
      client.retrieveFile(path, out)
      out.close()
      out.toByteArray
    }

  def delete(path: FilePath): Task[Unit] =
    Task { client.deleteFile(path) }

  def rename(from: FilePath, to: FilePath): Task[Unit] =
    Task { client.rename(from, to) }

  def mkDir(path: FilePath): Task[Unit] =
    Task { client.makeDirectory(path) }

  def quit: Task[Unit] =
    Task { client.quit() }

  def disconnect: Task[Unit] =
    Task { client.disconnect() }

}

private[lib] object FileFilter extends FTPFileFilter {
  def accept(file: FTPFile) = file.isFile
}
