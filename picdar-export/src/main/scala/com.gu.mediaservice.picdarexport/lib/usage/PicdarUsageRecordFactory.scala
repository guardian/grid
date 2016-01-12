package com.gu.mediaservice.picdarexport.lib.usage

import scala.util.{Try, Success, Failure}

import org.joda.time.DateTime

import com.gu.mediaservice.picdarexport.model.PicdarUsageRecord


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
          edition = element.get("editiontext").foldLeft(1)((_, e) => { e.toInt }),
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
