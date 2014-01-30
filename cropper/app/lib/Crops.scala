package lib

import java.io._
import java.net.URI
import java.util.concurrent.Executors
import java.nio.channels.Channels
import scala.concurrent.{ExecutionContext, Future}
import org.im4java.core.{ConvertCmd, IMOperation}
import model.Bounds


object Crops {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagickThreadPoolSize))

  /** Crops the source image and saves the output to a JPEG file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def create(source: URI, bounds: Bounds): Future[File] = Future {
    val Bounds(x, y, w, h) = bounds

    val sourceFile = createTempFile("cropSource", "")
    val outputFile = createTempFile("cropOutput", ".jpg")

    val channel = Channels.newChannel(source.toURL.openStream)
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

