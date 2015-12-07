package com.gu.mediaservice.model

import play.api.libs.json._
import org.joda.time.DateTime

import scala.collection.JavaConverters._


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


