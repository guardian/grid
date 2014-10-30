package lib.imaging

import java.io.File
import scala.util.{Success, Failure, Try}
import scala.concurrent.{ExecutionContext, Future}
import com.drew.metadata.exif.{ExifIFD0Descriptor, ExifIFD0Directory}
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.iptc.{IptcDescriptor, IptcDirectory}
import com.drew.metadata.Metadata
import java.util.concurrent.Executors


// TODO: figure out a better validation strategy i.e.
// we don't just through the image away (perhaps keep it in a "deal-with bucket"),

object ImageMetadata {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def fromIPTCHeaders(image: File, validate: Boolean = false): Future[Option[ImageMetadata]] =
    for {
      metadata <- readMetadata(image)
    }
    yield {
      for {
        iptcDir <- Option(metadata.getDirectory(classOf[IptcDirectory]))
        iptcDescriptor = new IptcDescriptor(iptcDir)
      }
      yield {
        val imageMetadata = for {
          description <- requiredString(iptcDescriptor.getCaptionDescription)
          credit <- requiredString(iptcDescriptor.getCreditDescription)
        } yield {
          ImageMetadata(
            description,
            credit,
            nonEmptyTrimmed(iptcDescriptor.getByLineDescription),
            nonEmptyTrimmed(iptcDescriptor.getHeadlineDescription),
            nonEmptyTrimmed(iptcDescriptor.getCopyrightNoticeDescription),
            nonEmptyTrimmed(getExifAlternative(metadata, ExifIFD0Directory.TAG_COPYRIGHT, iptcDescriptor.getCopyrightNoticeDescription)),
            nonEmptyTrimmed(Option(iptcDescriptor.getOriginalTransmissionReferenceDescription)
              .getOrElse(iptcDescriptor.getObjectNameDescription)),
            nonEmptyTrimmed(iptcDescriptor.getSourceDescription),
            nonEmptyTrimmed(iptcDescriptor.getSpecialInstructionsDescription),
            nonEmptyTrimmed(iptcDescriptor.getKeywordsDescription) map (_.split(Array(';', ',')).toList) getOrElse Nil,
            nonEmptyTrimmed(iptcDescriptor.getCityDescription),
            nonEmptyTrimmed(iptcDescriptor.getCountryOrPrimaryLocationDescription)
          )
        }

        imageMetadata match {
          case Success(i) => i
          case Failure(e) => throw InvalidMetaData
        }
      }
    }

  private def requiredString(nullableStr: String) = Try(nullableStr.toString)

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

  private def readMetadata(file: File): Future[Metadata] =
    Future(ImageMetadataReader.readMetadata(file))

  private def getExifAlternative(metadata: Metadata, exifTag: Int, alternative: String) =
    Option(metadata.getDirectory(classOf[ExifIFD0Directory])).map { exifDirectory =>
      new ExifIFD0Descriptor(exifDirectory).getDescription(exifTag)
    }.getOrElse(alternative)
}

// TODO: More intelligent messaging
object InvalidMetaData extends Throwable("Image description or credit missing")

case class ImageMetadata(
  description: String,
  credit: String,
  byline: Option[String],
  title: Option[String],
  copyrightNotice: Option[String],
  copyright: Option[String],
  suppliersReference: Option[String],
  source: Option[String],
  specialInstructions: Option[String],
  keywords: List[String],
  city: Option[String],
  country: Option[String]
)
