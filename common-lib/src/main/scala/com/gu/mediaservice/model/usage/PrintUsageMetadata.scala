package com.gu.mediaservice.model.usage

import com.gu.mediaservice.lib.dynamo.{DbInt, DbLong, DbNestedMap, DbString, DynamoElement}
import play.api.libs.json._
import org.joda.time.DateTime

import scala.jdk.CollectionConverters._

case class PrintImageSize(
  x: Int,
  y: Int
) extends UsageMetadata {
  override def toMap = Map(
    "x" -> x,
    "y" -> y
  )
  override def toDynamoMap: Map[String, DynamoElement] = Map("x" -> DbInt(x), "y" -> DbInt(y))
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
) extends UsageMetadata {

  type MapStringIntElement = List[(String, java.util.Map[String, Int])]
  type StringElement = List[(String,String)]
  type LongElement = List[(String,Long)]
  type IntElement = List[(String,Int)]

  override def toMap = Map(
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
      notes.foldLeft[StringElement](Nil)((_,s) => if(s.isEmpty) Nil else List("notes" -> s)) ++
      source.foldLeft[StringElement](Nil)((_,s) => if(s.isEmpty) Nil else List("source" -> s))

  override def toDynamoMap: Map[String, DynamoElement] = Map(
    "sectionName" -> DbString(sectionName),
    "issueDate" -> DbString(issueDate.toString),
    "pageNumber" -> DbInt(pageNumber),
    "storyName" -> DbString(storyName),
    "publicationCode" -> DbString(publicationCode),
    "publicationName" -> DbString(publicationName),
    "sectionCode" -> DbString(sectionCode)
  ) ++ size.map(s => "size" -> DbNestedMap(s.toDynamoMap)) ++
    orderedBy.map(o => "orderedBy" -> DbString(o)) ++
    layoutId.map(l => "layoutId" -> DbLong(l)) ++
    edition.map(e => "edition" -> DbInt(e)) ++
    notes.map(n => "notes" -> DbString(n)) ++
    source.map(s => "source" -> DbString(s))

}
object PrintUsageMetadata {
  import JodaWrites._
  import JodaReads._

  implicit val reads: Reads[PrintUsageMetadata] = Json.reads[PrintUsageMetadata]
  implicit val writes: Writes[PrintUsageMetadata] = Json.writes[PrintUsageMetadata]
}
