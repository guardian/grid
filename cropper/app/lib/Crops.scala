package lib

import java.io._
import scala.concurrent.Future

import _root_.play.api.libs.concurrent.Execution.Implicits._
import lib.Files._
import model.{Dimensions, CropSource}


object Crops {
  import lib.imaging.Convert._
  import lib.imaging.ExifTool

  /** Crops the source image and saves the output to a JPEG file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def create(sourceFile: File, spec: CropSource, dimensions: Dimensions): Future[File] = {
    val s0 = ExifTool.tagSource(sourceFile)
    val s1 = ExifTool.getTags(s0)("AuthorsPosition")
    val s2 = ExifTool.getTags(s1)("Creator")

    ExifTool.runOp(s2) onSuccess {
      case tag => println(s"ohnoes: $tag whoop")
    }

    for {
      outputFile <- createTempFile("cropOutput", ".jpg")
      source      = imageSource(sourceFile)
      stripped    = stripMeta(source)
      cropped     = cropResize(stripped, spec.bounds, dimensions)
      addOutput   = addDestImage(stripped, outputFile)
      _          <- runOp(addOutput)
    }
    yield outputFile
  }

}
