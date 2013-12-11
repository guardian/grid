package lib

import java.io._
import java.net.URL
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import org.im4java.core.{ConvertCmd, IMOperation}
import java.nio.channels.Channels


object Crops {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagickThreadPoolSize))

  /** Crops the source image and saves the output to a file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def crop(source: URL, bounds: Bounds): Future[File] = Future {
    val Bounds(x, y, w, h) = bounds

    val sourceFile = createTempFile("cropSource", "")
    val outputFile = createTempFile("cropOutput", "")

    val channel = Channels.newChannel(source.openStream)
    val output = new FileOutputStream(sourceFile)
    output.getChannel.transferFrom(channel, 0, java.lang.Long.MAX_VALUE)

    val cmd = new ConvertCmd
    val op = new IMOperation
    op.addImage(sourceFile.getAbsolutePath)
    op.crop(w, h, x, y)
    op.addImage(outputFile.getAbsolutePath)
    cmd.run(op)
    sourceFile.delete()
    outputFile

  }

  def createTempFile(prefix: String, suffix: String): File =
    File.createTempFile(prefix, suffix, Config.tempDir)

}

case class Bounds(x: Int, y: Int, width: Int, height: Int)
