package lib

import java.io._
import scala.concurrent.Future

import _root_.play.api.libs.concurrent.Execution.Implicits._
import lib.Files._
import model.{Dimensions, CropSource}
import lib.imaging.Conversion


object Crops {

  /** Crops the source image and saves the output to a JPEG file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def create(sourceFile: File, source: CropSource, dimensions: Dimensions): Future[File] =
    for {
      outputFile <- createTempFile("cropOutput", ".jpg")
      imageSource = Conversion.imageSource(outputFile)
      cropped     = Conversion.cropResize(imageSource, source.bounds, dimensions)
      stripped    = Conversion.stripMeta(cropped)
      addOutput   = Conversion.addDestImage(stripped, outputFile)
      _          <- Conversion.runOp(addOutput)
    }
    yield outputFile

}
