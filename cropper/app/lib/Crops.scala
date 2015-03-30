package lib

import java.io._
import scala.concurrent.Future

import _root_.play.api.libs.concurrent.Execution.Implicits._
import lib.Files._
import model.{Dimensions, CropSource}


object Crops {
  import lib.imaging.Conversion._

  /** Crops the source image and saves the output to a JPEG file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def create(sourceFile: File, spec: CropSource, dimensions: Dimensions): Future[File] =
    for {
      outputFile <- createTempFile("cropOutput", ".jpg")
      source      = imageSource(sourceFile)
      cropped     = cropResize(source, spec.bounds, dimensions)
      stripped    = stripMeta(cropped)
      addOutput   = addDestImage(stripped, outputFile)
      _          <- runOp(addOutput)
    }
    yield outputFile

}
