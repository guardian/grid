package com.gu.mediaservice.picdarexport.model

import com.gu.mediaservice.model.UsageStatus
import org.joda.time.DateTime
import play.api.libs.json._


case class PicdarUsageRecord(
  urn: String,
  dbParent: String,
  createdDate: DateTime,
  publicationDate: DateTime,
  productionName: String,
  publicationName: String,
  page: Int,
  sectionName: String,
  edition: Option[Int],
  status: UsageStatus,
  notes: Option[String]
)

object PicdarUsageRecord {
  import com.gu.mediaservice.model.DateFormat

  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[PicdarUsageRecord] = Json.reads[PicdarUsageRecord]
  implicit val writes: Writes[PicdarUsageRecord] = Json.writes[PicdarUsageRecord]
}
