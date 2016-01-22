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
  )
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
  publicationName: String,
  layoutId: Option[Long] = None,
  edition: Option[Int],
  size: Option[PrintImageSize] = None,
  orderedBy: Option[String] = None,
  sectionCode: String,
  notes: Option[String] = None,
  source: Option[String] = None
) {

  type MapStringIntElement = List[(String, java.util.Map[String, Int])]
  type StringElement = List[(String,String)]
  type LongElement = List[(String,Long)]
  type IntElement = List[(String,Int)]

  def toMap = Map(
    "sectionName" -> sectionName,
    "issueDate" -> issueDate.toString,
    "pageNumber" -> pageNumber,
    "storyName" -> storyName,
    "publicationCode" -> publicationCode,
    "publicationName" -> publicationName,
    "sectionCode" -> sectionCode
    ) ++ size.foldLeft[MapStringIntElement](Nil)((_,m) => List("size" -> m.toMap.asJava)) ++
      orderedBy.foldLeft[StringElement](Nil)((_,s) => List("orderedBy" -> s)) ++
      layoutId.foldLeft[LongElement](Nil)((_,l) => List("layoutId" -> l)) ++
      edition.foldLeft[IntElement](Nil)((_,i) => List("edition" -> i)) ++
      notes.foldLeft[StringElement](Nil)((_,s) => List("notes" -> s))
}
object PrintUsageMetadata {
  implicit val dateTimeFormat = DateFormat
  implicit val reads: Reads[PrintUsageMetadata] = Json.reads[PrintUsageMetadata]
  implicit val writes: Writes[PrintUsageMetadata] = Json.writes[PrintUsageMetadata]
}


