package lib

import java.io._
import scala.concurrent.Future

import _root_.play.api.libs.concurrent.Execution.Implicits._
import lib.Files._
import model.{Dimensions, CropSource}

import com.gu.mediaservice.model.ImageMetadata

object Crops {
  import lib.imaging.Convert._
  import lib.imaging.ExifTool._

  def tagFilter(metadata: ImageMetadata) = {
    Map[String, Option[String]](
      "Copyright" -> metadata.copyright,
      "CopyrightNotice" -> metadata.copyrightNotice,
      "Credit" -> metadata.credit,
      "OriginalTransmissionReference" -> metadata.suppliersReference
    ).collect { case (key, Some(value)) => (key, value) }
  }

  /** Crops the source image and saves the output to a JPEG file on disk.
    *
    * It is the responsibility of the caller to clean up the file when it is no longer needed.
    */
  def create(sourceFile: File, spec: CropSource, dimensions: Dimensions, metadata: ImageMetadata): Future[File] = {
    for {
      outputFile <- createTempFile("cropOutput", ".jpg")
      cropSource  = imageSource(sourceFile)
      stripped    = stripMeta(cropSource)
      cropped     = cropResize(stripped)(spec.bounds, dimensions)
      addOutput   = addDestImage(cropped)(outputFile)
      _          <- runConvertCmd(addOutput)
      source      = tagSource(outputFile)
      tags        = tagFilter(metadata)
      tagged      = setTags(source)(tags)
      _          <- runExiftoolCmd(tagged)
    }
    yield outputFile
  }

}
