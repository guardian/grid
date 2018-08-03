package com.gu.mediaservice.model.usage

import play.api.libs.json._
import org.joda.time.DateTime


case class Usage(
  id: String,
  references: List[UsageReference],
  platform: UsageType,
  media: String,
  status: UsageStatus,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime,
  printUsageMetadata: Option[PrintUsageMetadata] = None,
  digitalUsageMetadata: Option[DigitalUsageMetadata] = None
)
object Usage {
  import JodaWrites._
  import JodaReads._

  implicit val writes: Writes[Usage] = Json.writes[Usage]
  implicit val reads: Reads[Usage] = Json.reads[Usage]
}
