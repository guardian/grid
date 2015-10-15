package lib.imaging

import java.io.File
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}

import lib.Config
import org.im4java.core.{IMOperation, ConvertCmd}


object Thumbnailer {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagickThreadPoolSize))

  def createThumbnail(width: Int, filename: String): Future[File] = Future {
    val tempFile = createTempFile
    val useGraphicsMagick = true

    val convertCmd = new ConvertCmd(useGraphicsMagick)
    val imOp = new IMOperation
    imOp.addImage(filename)
    imOp.thumbnail(width)
    imOp.colorspace("RGB")
    imOp.addImage(tempFile.toString)
    convertCmd.run(imOp)

    tempFile
  }

  private def createTempFile: File =
    File.createTempFile("thumbnail", "", new File(Config.tempDir))

}
