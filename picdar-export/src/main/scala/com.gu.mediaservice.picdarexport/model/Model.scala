package com.gu.mediaservice.picdarexport.model

import java.net.URI

import org.joda.time.DateTime

case class Asset(
  urn: String,
  file: URI,
  created: DateTime,
  modified: Option[DateTime],
  metadata: Map[String, String],
  infoUri: Option[URI]
)

case class DateRange(start: Option[DateTime], end: Option[DateTime])
