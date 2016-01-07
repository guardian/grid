package com.gu.mediaservice.picdarexport.lib.usage

import scala.util.{Try, Success, Failure}
import org.joda.time.DateTime


case class PicdarUsageRecord(
  urn: String,
  dbParent: String,
  createdDate: DateTime,
  publicationDate: DateTime,
  productionName: String,
  publicationName: String,
  page: Int,
  sectionName: String,
  edition: Int,
  status: String,
  notes: Option[String]
)

object PicdarUsageRecordFactory {


  def create(responseString: String): List[PicdarUsageRecord] = {
    val responseElements = ResponseParser.parse(responseString)

    responseElements.flatMap( element => {

      def extractOrThrow(field: String) =
        element.get(field).getOrElse {
          throw new NoSuchElementException(s"Missing $field in $element")
        }

      Try {
        PicdarUsageRecord(
          urn          = extractOrThrow("_urn"),
          dbParent     = extractOrThrow("_parent"),
          createdDate  = DateTime.now(),
          publicationDate = DateTime.now(),
          productionName  = extractOrThrow("production"),
          publicationName = extractOrThrow("publicationtext"),
          page = extractOrThrow("page").toInt,
          sectionName = extractOrThrow("sectiontext"),
          edition = extractOrThrow("editiontext").toInt,
          status = extractOrThrow("status"),
          notes = element.get("notes")
        )
      } match {
        case Success(record) => Some(record)
        case Failure(f) => { println(f); None }
      }
    }).toList
  }
}

object ResponseParser {
  // load from file temporarily
  val stub = scala.io.Source.fromFile("/home/rkenny/output.picdar").mkString

  private def clean(attr: String) = attr.trim.stripPrefix("\"").stripSuffix("\"")
  private val splitLine = """^\s*(.*?)\s*=\s(\S[\s\S]*?)""".r

  def parse(response: String) = response
    .split("\\n\\n")
    .map(_.split("\\n").toList)
    .map(
      _.flatMap(_ match {
        case splitLine(k,v) => Some(k,clean(v))
        case _ => None
      }).toMap
    )
}
