package com.gu.mediaservice.model

import org.joda.time.DateTime

case class ImageMetadata(
  dateTaken:           Option[DateTime],
  description:         Option[String],
  credit:              Option[String],
  byline:              Option[String],
  bylineTitle:         Option[String],
  title:               Option[String],
  copyrightNotice:     Option[String],
  copyright:           Option[String],
  suppliersReference:  Option[String],
  source:              Option[String],
  specialInstructions: Option[String],
  keywords:            List[String],
  subLocation:         Option[String],
  city:                Option[String],
  state:               Option[String],
  country:             Option[String]
)
