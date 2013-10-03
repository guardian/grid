package lib

import scala.annotation.tailrec
import java.io.{IOException, InputStream}
import org.apache.commons.net.ftp.{FTP, FTPClient}
import java.security.{DigestInputStream, MessageDigest}
import org.slf4j.LoggerFactory
import org.apache.commons.net.util.Base64
import org.apache.commons.codec.binary.{Hex, Base32}


class FTPWatcher(path: String, batchSize: Int, emptyWait: Int = 1000) {

  private val log = LoggerFactory.getLogger("FTPWatcher")

  @tailrec
  final def run(callback: String => InputStream => Unit) {
    try {
      run_(callback)
    }
    catch {
      case e: IOException => log.error("FTP client caused IOException", e)
    }
    log.info("Restarting in 3s...")
    run(callback)
  }

  private def run_(callback: String => InputStream => Unit) {
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
          callback(filename)(stream)
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

  import java.nio.file.Files

  def main(args: Array[String]) {
    def path = args.headOption.getOrElse(sys.error("Path not supplied"))
    val watcher = new FTPWatcher(path, 8)
    val destinationDir = Files.createTempDirectory("ftp-downloads")

    def saveFile(filename: String)(is: java.io.InputStream) {
      val tempFile = destinationDir.resolve(filename)
      val digest = base32(md5(is, Files.copy(_, tempFile)))
      println(s"Saved file to $tempFile")
      val finalDest = destinationDir.resolve(digest)
      Files.move(tempFile, finalDest)
      println(s"Moved $tempFile to $finalDest")
    }
    watcher.run(saveFile)
  }

  def md5(stream: InputStream, callback: InputStream => Unit): Array[Byte] = {
    val md = MessageDigest.getInstance("MD5")
    val input = new DigestInputStream(stream, md)
    callback(input)
    md.digest
  }

  def base32(bytes: Array[Byte]): String =
    (new Base32).encodeAsString(bytes).toLowerCase.reverse.dropWhile(_ == '=').reverse.mkString

}
