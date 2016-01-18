package com.gu.mediaservice.picdarexport.lib.usage

import scala.util.{Try, Success, Failure}

import org.joda.time.DateTime

import com.gu.mediaservice.model.UsageStatus
import com.gu.mediaservice.picdarexport.model.{PicdarUsageRecord, PicdarDates}


object PicdarUsageRecordFactory {

  def create(responseString: String): List[PicdarUsageRecord] = {
    val responseElements = ResponseParser.parse(responseString)

    responseElements.flatMap( element => {

      def missingFieldException(field: String) =
        new NoSuchElementException(s"Missing $field in $element")

      def extractOrThrow(field: String) =
        element.get(field).getOrElse { throw missingFieldException(field) }

      Try {
        PicdarUsageRecord(
          urn          = extractOrThrow("_urn"),
          dbParent     = extractOrThrow("_parent"),
          createdDate  = PicdarDates.usageApiLongDateFormat
            .parseDateTime(s"${extractOrThrow("_date")}-${extractOrThrow("_time")}"),
          publicationDate = PicdarDates.usageApiShortDateFormat
            .parseDateTime(extractOrThrow("publicationdate")),
          productionName  = extractOrThrow("production"),
          publicationName = extractOrThrow("publicationtext"),
          page = extractOrThrow("page").toInt,
          sectionName = extractOrThrow("sectiontext"),
          edition = element.get("editiontext").flatMap(e => Try { e.toInt }.toOption),
          status = element.get("status").map(UsageStatus(_)).getOrElse {
            throw missingFieldException("status")
          },
          notes = element.get("notes")
        )
      } match {
        case Success(record) => Some(record)
        case Failure(f) => { println(f); None }
      }
    }).toList
  }
}
