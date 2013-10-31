package lib

import java.io.InputStream
import org.apache.commons.net.ftp.{FTP, FTPFile, FTPClient}
import scalaz.concurrent.Task


final class Client {

  private val client = new FTPClient

  def connect(host: String, port: Int): Task[Unit] =
    Task.delay(client.connect(host, port))

  def login(user: String, password: String): Task[Boolean] =
    Task.delay(client.login(user, password))

  def pwd: Task[String] =
    Task.delay(client.printWorkingDirectory)

  def cwd(path: String): Task[Boolean] =
    Task.delay(client.changeWorkingDirectory(path))

  def enterLocalPassiveMode: Task[Unit] =
    Task.delay(client.enterLocalPassiveMode())

  def setBinaryFileType: Task[Unit] =
    Task.delay(client.setFileType(FTP.BINARY_FILE_TYPE))

  def listFiles: Task[List[FTPFile]] =
    Task.delay(client.listFiles.toList)

  def retrieveFile(path: String): Task[InputStream] =
    Task.delay(client.retrieveFileStream(path))

  def delete(path: String): Task[Unit] =
    Task.delay(client.deleteFile(path))

  def completePendingCommand: Task[Unit] =
    Task.delay(client.completePendingCommand())

  def quit: Task[Unit] =
    Task.delay(client.quit())

  def disconnect: Task[Unit] =
    Task.delay(client.disconnect())

}
