package lib.imaging

import java.io.File
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}

import lib.Config
import org.im4java.core.{IMOperation, ConvertCmd}


object Thumbnailer {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(4))

  val maxWidth = 256

  def createThumbnail(filename: String): Future[File] = Future {
    val tempFile = createTempFile

    val cmd = new ConvertCmd
    val op = new IMOperation
    op.addImage(filename)
    op.adaptiveResize(maxWidth)
    op.addImage(tempFile.toString)
    cmd.run(op)

    tempFile
  }

  private def createTempFile: File =
    File.createTempFile("thumbnail", "", new File(Config.tempDir))

}
