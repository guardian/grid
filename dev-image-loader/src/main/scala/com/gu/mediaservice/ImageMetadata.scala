package com.gu.mediaservice

import java.io.File

import com.drew.imaging.ImageMetadataReader._
import com.drew.metadata.iptc.{IptcDescriptor, IptcDirectory}


object ImageMetadata {

  def iptc(image: File): Option[IptcMetadata] =
    for {
      iptcDir <- Option(readMetadata(image).getDirectory(classOf[IptcDirectory]))
      descriptor = new IptcDescriptor(iptcDir)
    } yield IptcMetadata(
      Option(descriptor.getCaptionDescription),
      Option(descriptor.getByLineDescription),
      Option(descriptor.getHeadlineDescription),
      Option(descriptor.getCreditDescription),
      Option(descriptor.getCopyrightNoticeDescription),
      Option(descriptor.getSourceDescription),
      Option(descriptor.getSpecialInstructionsDescription),
      Option(descriptor.getKeywordsDescription) map (_.split(Array(';', ',')).toList) getOrElse Nil,
      Option(descriptor.getCityDescription),
      Option(descriptor.getCountryOrPrimaryLocationDescription)
    )

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
