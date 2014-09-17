package lib.imaging

import java.io.File
import com.drew.metadata.icc.{IccDescriptor, IccDirectory}
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
        iptcDescriptor = new IptcDescriptor(iptcDir)
      }
      yield {
        ImageMetadata(
          nonEmptyTrimmed(iptcDescriptor.getCaptionDescription),
          nonEmptyTrimmed(iptcDescriptor.getByLineDescription),
          nonEmptyTrimmed(iptcDescriptor.getHeadlineDescription),
          nonEmptyTrimmed(iptcDescriptor.getCreditDescription),
          nonEmptyTrimmed(iptcDescriptor.getCopyrightNoticeDescription),
          nonEmptyTrimmed(getIccAlternatve(metadata, IccDirectory.TAG_ICC_TAG_cprt, iptcDescriptor.getCopyrightNoticeDescription)),
          nonEmptyTrimmed(Option(iptcDescriptor.getOriginalTransmissionReferenceDescription)
            .getOrElse(iptcDescriptor.getObjectNameDescription)),
          nonEmptyTrimmed(iptcDescriptor.getSourceDescription),
          nonEmptyTrimmed(iptcDescriptor.getSpecialInstructionsDescription),
          nonEmptyTrimmed(iptcDescriptor.getKeywordsDescription) map (_.split(Array(';', ',')).toList) getOrElse Nil,
          nonEmptyTrimmed(iptcDescriptor.getCityDescription),
          nonEmptyTrimmed(iptcDescriptor.getCountryOrPrimaryLocationDescription)
        )
      }
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
    Future(ImageMetadataReader.readMetadata(file))

  private def getIccAlternatve(metadata: Metadata, iccTag: Int, alternative: String) =
    Option(metadata.getDirectory(classOf[IccDirectory])).map { iccDirectory =>
      new IccDescriptor(iccDirectory).getDescription(iccTag)
    }.getOrElse(alternative)

}

case class ImageMetadata(
  description: Option[String],
  byline: Option[String],
  title: Option[String],
  credit: Option[String],
  copyrightNotice: Option[String],
  copyright: Option[String],
  suppliersReference: Option[String],
  source: Option[String],
  specialInstructions: Option[String],
  keywords: List[String],
  city: Option[String],
  country: Option[String]
)
