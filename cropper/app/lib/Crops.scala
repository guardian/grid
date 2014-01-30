package lib

import java.io._
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import org.im4java.core.{ConvertCmd, IMOperation}

import lib.Files._
import model.{Dimensions, Crop, Bounds}


object Crops {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagickThreadPoolSize))

  /** Crops the source image and saves the output to a JPEG file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def create(sourceFile: File, crop: Crop, dimensions: Dimensions, outputFilename: String): Future[File] = Future {
    val Bounds(x, y, w, h) = crop.bounds

    val outputFile = createTempFile("cropOutput", ".jpg")

    val cmd = new ConvertCmd
    val op = new IMOperation
    op.addImage(sourceFile.getAbsolutePath)
    op.crop(w, h, x, y)
    op.addImage(outputFile.getAbsolutePath)

    if (w != dimensions.width || h != dimensions.height) {
      op.resize(dimensions.width, dimensions.height)
    }

    cmd.run(op)
    outputFile
  }

}
