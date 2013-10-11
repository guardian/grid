package lib

import scala.annotation.tailrec
import scala.concurrent.Future
import java.io.{IOException, InputStream}
import java.nio.file.{Files, Path}
import java.security.{DigestInputStream, MessageDigest}

import org.apache.commons.net.ftp.{FTP, FTPClient}
import org.slf4j.LoggerFactory
import org.apache.commons.codec.binary.Base32
import play.api.libs.ws.WS
import play.api.libs.concurrent.Execution.Implicits._


class FTPWatcher(path: String, batchSize: Int, withFile: (String, InputStream) => Unit, emptyWait: Int = 1000) {

  import FTPWatcher.log

  @tailrec
  final def run() {
    try run_(withFile)
    catch {
      case e: IOException => log.error("FTP client caused IOException", e)
    }
    log.info("Restarting in 3s...")
    run()
  }

  private def run_(withFile: (String, InputStream) => Unit) {
    val client = new FTPClient

    try {
      client.connect(Config.ftpHost, Config.ftpPort)

      val loggedIn = client.login(Config.ftpUser, Config.ftpPassword)
      if (!loggedIn) sys.error("Not logged in")

      val changedDir = client.changeWorkingDirectory(path)
      if (!changedDir) sys.error(s"Invalid path $path")

      client.enterLocalPassiveMode()
      client.setFileType(FTP.BINARY_FILE_TYPE)

      while (true) {
        val files = client.listFiles.toList.take(batchSize)
        for (file <- files) {
          val filename = file.getName
          log.info(s"Retrieving file: $filename")
          val stream = client.retrieveFileStream(filename)
          withFile(filename, stream)
          stream.close()
          log.info(s"Deleting file: $filename")
          client.deleteFile(filename)
          client.completePendingCommand()
        }
        if (files.isEmpty) Thread.sleep(emptyWait)
      }
    }
    finally {
      client.disconnect()
    }
  }

}

object FTPWatcher {

  lazy val watcher: Future[Unit] = Future { main(Array("getty")) }

  protected val log = LoggerFactory.getLogger("FTPWatcher")

  def main(args: Array[String]) {
    def path = args.headOption.getOrElse(sys.error("Path not supplied"))
    val destination = Files.createTempDirectory("ftp-downloads")
    val watcher = new FTPWatcher(path, 8, loadFile(destination))
    watcher.run()
  }

  def loadFile(destination: Path)(filename: String, is: InputStream) {
    val tempFile = destination.resolve(filename)
    val digest = base32(md5(is, Files.copy(_, tempFile)))
    log.info(s"Saved file to $tempFile, md5: $digest")
    WS.url(Config.imageLoaderUri).post(tempFile.toFile)
  }

  def md5(stream: InputStream, callback: InputStream => Unit): Array[Byte] = {
    val md = MessageDigest.getInstance("MD5")
    val input = new DigestInputStream(stream, md)
    callback(input)
    md.digest
  }

  def base32(bytes: Array[Byte]): String =
    (new Base32).encodeAsString(bytes).toLowerCase.reverse.dropWhile(_ == '=').reverse

}
