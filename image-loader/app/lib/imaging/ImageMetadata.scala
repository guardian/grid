package lib.imaging

import java.io.File

import scala.concurrent.{ExecutionContext, Future}
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.iptc.{IptcDescriptor, IptcDirectory}
import com.drew.metadata.jpeg.JpegDirectory
import model.Dimensions
import com.drew.metadata.Metadata
import java.util.concurrent.Executors


object ImageMetadata {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def fromIPTCHeaders(image: File): Future[Option[ImageMetadata]] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      for {
        iptcDir <- Option(metadata.getDirectory(classOf[IptcDirectory]))
        descriptor = new IptcDescriptor(iptcDir)
      }
      yield ImageMetadata(
        nonEmptyTrimmed(descriptor.getCaptionDescription),
        nonEmptyTrimmed(descriptor.getByLineDescription),
        nonEmptyTrimmed(descriptor.getHeadlineDescription),
        nonEmptyTrimmed(descriptor.getCreditDescription),
        nonEmptyTrimmed(descriptor.getCopyrightNoticeDescription),
        nonEmptyTrimmed(descriptor.getSourceDescription),
        nonEmptyTrimmed(descriptor.getSpecialInstructionsDescription),
        nonEmptyTrimmed(descriptor.getKeywordsDescription) map (_.split(Array(';', ',')).toList) getOrElse Nil,
        nonEmptyTrimmed(descriptor.getCityDescription),
        nonEmptyTrimmed(descriptor.getCountryOrPrimaryLocationDescription)
      )
    }

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
    Future {
      ImageMetadataReader.readMetadata(file)
    }

}

case class ImageMetadata(
  description: Option[String],
  byline: Option[String],
  title: Option[String],
  credit: Option[String],
  copyrightNotice: Option[String],
  source: Option[String],
  specialInstructions: Option[String],
  keywords: List[String],
  city: Option[String],
  country: Option[String]
)
