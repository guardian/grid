package lib.imaging

import java.io.File
import java.util.concurrent.Executors
import scala.collection.JavaConversions._
import scala.concurrent.{ExecutionContext, Future}

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.{Metadata, Directory}
import com.drew.metadata.iptc.IptcDirectory
import com.drew.metadata.jpeg.JpegDirectory
import com.drew.metadata.exif.{ExifSubIFDDirectory, ExifIFD0Directory}
import com.drew.metadata.xmp.XmpDirectory

import com.gu.mediaservice.model.Dimensions

import com.gu.mediaservice.model.FileMetadata


object FileMetadataReader {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def fromIPTCHeaders(image: File): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      // FIXME: JPEG, JFIF, Photoshop, GPS, File, ICC directories?
      FileMetadata(
        exportDirectory(metadata, classOf[IptcDirectory]),
        exportDirectory(metadata, classOf[ExifIFD0Directory]),
        exportDirectory(metadata, classOf[ExifSubIFDDirectory]),
        exportDirectory(metadata, classOf[XmpDirectory]),
        exportGettyDirectory(metadata)
      )
    }

  // Export all the metadata in the directory
  private def exportDirectory[T <: Directory](metadata: Metadata, directoryClass: Class[T]): Map[String, String] =
    Option(metadata.getFirstDirectoryOfType(directoryClass)) map { directory =>
      directory.getTags.
        filter(tag => tag.hasTagName()).
        // Ignore seemingly useless "Padding" fields
        // see: https://github.com/drewnoakes/metadata-extractor/issues/100
        filter(tag => tag.getTagName != "Padding").
        // Ignore meta-metadata
        filter(tag => tag.getTagName != "XMP Value Count").
        flatMap { tag =>
          nonEmptyTrimmed(tag.getDescription) map { value => tag.getTagName -> value }
        }.toMap
    } getOrElse Map()

  // Getty made up their own XMP namespace.
  // We're awaiting actual documentation of the properties available, so
  // this only extracts a small subset of properties as a means to identify Getty images.
  private def exportGettyDirectory(metadata: Metadata): Map[String, String] =
    Option(metadata.getFirstDirectoryOfType(classOf[XmpDirectory])) map { directory =>
      val xmpProperties = directory.getXmpProperties.toMap
      Map(
        "Asset ID"                  -> xmpProperties.get("GettyImagesGIFT:AssetID"),
        "Call For Image"            -> xmpProperties.get("GettyImagesGIFT:CallForImage"),
        "Camera Filename"           -> xmpProperties.get("GettyImagesGIFT:CameraFilename"),
        "Camera Make Model"         -> xmpProperties.get("GettyImagesGIFT:CameraMakeModel"),
        "Composition"               -> xmpProperties.get("GettyImagesGIFT:Composition"),
        "Exclusive Coverage"        -> xmpProperties.get("GettyImagesGIFT:ExclusiveCoverage"),
        "Image Rank"                -> xmpProperties.get("GettyImagesGIFT:ImageRank"),
        "Original Create Date Time" -> xmpProperties.get("GettyImagesGIFT:OriginalCreateDateTime"),
        "Original Filename"         -> xmpProperties.get("GettyImagesGIFT:OriginalFilename"),
        "Personality"               -> xmpProperties.get("GettyImagesGIFT:Personality"),
        "Time Shot"                 -> xmpProperties.get("GettyImagesGIFT:TimeShot")
      ).flattenOptions
    } getOrElse Map()


  def dimensions(image: File): Future[Option[Dimensions]] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      for {
        jpegDir <- Option(metadata.getFirstDirectoryOfType(classOf[JpegDirectory]))
      }
      yield Dimensions(jpegDir.getImageWidth, jpegDir.getImageHeight)
    }

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

  private def readMetadata(file: File): Future[Metadata] =
    Future(ImageMetadataReader.readMetadata(file))


  // Helper to flatten maps of options
  implicit class MapFlattener[K, V](val map: Map[K, Option[V]]) {
    def flattenOptions: Map[K, V] =
      map.collect { case (key, Some(value)) => key -> value }
  }

}
