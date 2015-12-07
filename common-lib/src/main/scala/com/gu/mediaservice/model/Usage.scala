package com.gu.mediaservice.model

import scala.util.Try
import play.api.libs.json._
import java.net.URL
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.collection.JavaConversions._

case class PrintImageSize(
  x: Int,
  y: Int
) {
  def toMap = Map(
    "x" -> x,
    "y" -> y
  ).asJava
}
object PrintImageSize {
  implicit val reads: Reads[PrintImageSize] = Json.reads[PrintImageSize]
  implicit val writes: Writes[PrintImageSize] = Json.writes[PrintImageSize]
}

case class PrintUsageMetadata(
  sectionName: String,
  issueDate: DateTime,
  pageNumber: Int,
  storyName: String,
  publicationCode: String,
  layoutId: Long,
  edition: Int,
  size: PrintImageSize,
  orderedBy: String,
  sectionCode: String
) {
  def toMap = Map(
    "sectionName" -> sectionName,
    "issueDate" -> issueDate.toString,
    "pageNumber" -> pageNumber,
    "storyName" -> storyName,
    "publicationCode" -> publicationCode,
    "layoutId" -> layoutId,
    "edition" -> edition,
    "size" -> size.toMap,
    "orderedBy" -> orderedBy,
    "sectionCode" -> sectionCode
  )
}
object PrintUsageMetadata {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[PrintUsageMetadata] = Json.reads[PrintUsageMetadata]
  implicit val writes: Writes[PrintUsageMetadata] = Json.writes[PrintUsageMetadata]
}


case class DigitalUsageMetadata(
  webTitle: String,
  webUrl: String,
  sectionId: String,
  composerUrl: Option[String] = None
) {

  def toMap = Map(
    "webTitle" -> webTitle,
    "webUrl" -> webUrl,
    "sectionId" -> sectionId
  ) ++ composerUrl.map("composerUrl" -> _)
}
object DigitalUsageMetadata {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[DigitalUsageMetadata] = Json.reads[DigitalUsageMetadata]
  implicit val writes: Writes[DigitalUsageMetadata] = Json.writes[DigitalUsageMetadata]
}


case class Usage(
  id: String,
  references: List[UsageReference],
  platform: String,
  media: String,
  status: String,
  dateAdded: Option[DateTime],
  dateRemoved: Option[DateTime],
  lastModified: DateTime,
  printUsageMetadata: Option[PrintUsageMetadata] = None,
  digitalUsageMetadata: Option[DigitalUsageMetadata] = None
)
object Usage {
  implicit val dateTimeWrites: Writes[DateTime] = new Writes[DateTime] {
    def writes(d: DateTime) = DateFormat.writes(d)
  }

  implicit val dateTimeReads: Reads[DateTime] = new Reads[DateTime] {
    def reads(json: JsValue) = DateFormat.reads(json)
  }

  implicit val writes: Writes[Usage] = Json.writes[Usage]
  implicit val reads: Reads[Usage] = Json.reads[Usage]
}


case class UsageReference(
  `type`: String,
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageReference {
  implicit val writes: Writes[UsageReference] = Json.writes[UsageReference]
  implicit val reads: Reads[UsageReference] = Json.reads[UsageReference]
}
