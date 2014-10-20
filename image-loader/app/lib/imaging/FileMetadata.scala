package lib.imaging

import java.io.File
import com.drew.metadata.exif.{ExifSubIFDDirectory, ExifIFD0Descriptor, ExifIFD0Directory}
import com.drew.metadata.xmp.XmpDirectory
import scala.concurrent.{ExecutionContext, Future}
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.iptc.{IptcDescriptor, IptcDirectory}
import com.drew.metadata.jpeg.JpegDirectory
import model.Dimensions
import com.drew.metadata.{Metadata, Directory}
import java.util.concurrent.Executors


import scala.collection.JavaConversions._


object FileMetadata {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def fromIPTCHeaders(image: File): Future[FileMetadata] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      FileMetadata(
        exportDirectory(metadata, classOf[IptcDirectory]),
        exportDirectory(metadata, classOf[ExifIFD0Directory]),
        exportDirectory(metadata, classOf[ExifSubIFDDirectory]),
        exportDirectory(metadata, classOf[XmpDirectory])
      )
    }

  // Export all the metadata in the directory
  def exportDirectory[T <: Directory](metadata: Metadata, directoryClass: Class[T]): Map[String, String] =
    Option(metadata.getDirectory(directoryClass)) map { directory =>
      directory.getTags.flatMap { tag =>
        nonEmptyTrimmed(tag.getDescription) map { value => tag.getTagName -> value }
      }.toMap
    } getOrElse Map()


  def dimensions(image: File): Future[Option[Dimensions]] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      for {
        jpegDir <- Option(metadata.getDirectory(classOf[JpegDirectory]))
      }
      yield Dimensions(jpegDir.getImageWidth, jpegDir.getImageHeight)
    }

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

  private def readMetadata(file: File): Future[Metadata] =
    Future(ImageMetadataReader.readMetadata(file))
}

case class FileMetadata(iptc: Map[String, String],
                        exif: Map[String, String],
                        exifSub: Map[String, String],
                        xmp: Map[String, String]
)
