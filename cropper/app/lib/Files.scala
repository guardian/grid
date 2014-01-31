package lib

import java.io.{FileOutputStream, File}
import java.nio.channels.Channels
import java.net.URL
import scala.concurrent.{Future, ExecutionContext}
import java.util.concurrent.Executors


object Files {

  private implicit val ctx = ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def createTempFile(prefix: String, suffix: String): Future[File] =
    Future {
      File.createTempFile(prefix, suffix, Config.tempDir)
    }

  def transferFromURL(from: URL, to: File): Future[Unit] =
    Future {
      val channel = Channels.newChannel(from.openStream)
      val output = new FileOutputStream(to)
      output.getChannel.transferFrom(channel, 0, java.lang.Long.MAX_VALUE)
    }

  def tempFileFromURL(from: URL, prefix: String, suffix: String): Future[File] =
    for {
      tempFile <- createTempFile(prefix, suffix)
      _ <- transferFromURL(from, tempFile)
    }
    yield tempFile

  def delete(file: File): Future[Unit] =
    Future(file.delete())

}
