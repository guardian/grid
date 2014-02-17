package lib

import java.io.InputStream
import org.apache.commons.net.ftp.{FTP, FTPFile, FTPClient}
import scalaz.concurrent.Task
import java.util.concurrent.{Executors, ExecutorService}


final class Client {

  private implicit val executor: ExecutorService = Executors.newCachedThreadPool

  private val client = new FTPClient

  def connect(host: String, port: Int): Task[Unit] =
    Task { client.connect(host, port) }

  def login(user: String, password: String): Task[Boolean] =
    Task { client.login(user, password) }

  def pwd: Task[String] =
    Task { client.printWorkingDirectory }

  def cwd(path: String): Task[Boolean] =
    Task { client.changeWorkingDirectory(path) }

  def enterLocalPassiveMode: Task[Unit] =
    Task.delay(client.enterLocalPassiveMode())

  def setBinaryFileType: Task[Unit] =
    Task.delay(client.setFileType(FTP.BINARY_FILE_TYPE))

  def listFiles: Task[List[FTPFile]] =
    Task { client.listFiles.toList }

  def retrieveFile(path: String): Task[InputStream] =
    Task { client.retrieveFileStream(path) }

  def delete(path: String): Task[Unit] =
    Task { client.deleteFile(path) }

  def completePendingCommand: Task[Unit] =
    Task { client.completePendingCommand() }

  def quit: Task[Unit] =
    Task { client.quit() }

  def disconnect: Task[Unit] =
    Task { client.disconnect() }

}
