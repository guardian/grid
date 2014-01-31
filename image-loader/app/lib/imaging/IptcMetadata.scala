package lib.imaging

import java.io.File

import com.drew.imaging.ImageMetadataReader._
import com.drew.metadata.iptc.{IptcDescriptor, IptcDirectory}
import com.drew.metadata.jpeg.JpegDirectory
import model.Dimensions


object IptcMetadata {

  def fromFile(image: File): Option[IptcMetadata] =
    for {
      iptcDir <- Option(readMetadata(image).getDirectory(classOf[IptcDirectory]))
      descriptor = new IptcDescriptor(iptcDir)
    } yield IptcMetadata(
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

  def dimensions(image: File): Option[Dimensions] =
    for {
      jpegDir <- Option(readMetadata(image).getDirectory(classOf[JpegDirectory]))
    } yield Dimensions(jpegDir.getImageWidth, jpegDir.getImageHeight)

  private def nonEmptyTrimmed(nullableStr: String): Option[String] =
    Option(nullableStr) map (_.trim) filter (_.nonEmpty)

}

case class IptcMetadata(
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
