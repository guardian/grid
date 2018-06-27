package com.gu.mediaservice.lib

import scala.concurrent.duration.Duration
import scala.util.Try
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import org.joda.time.format.DateTimeFormatterBuilder

package object formatting {

  private val parseDateTimeFormat = {
    val parsers = Array(
      // Allow ISO date time with millis even though ES has no millis so they are ignored
      ISODateTimeFormat.dateTime,
      ISODateTimeFormat.dateTimeNoMillis
    ).map(_.getParser)
    new DateTimeFormatterBuilder().
      append(null, parsers).
      toFormatter.
      withZoneUTC
  }

  val dateTimeFormat = parseDateTimeFormat.withZoneUTC

  def printDateTime(date: DateTime): String = date.toString()
  def printOptDateTime(date: Option[DateTime]): Option[String] = date.map(printDateTime)

  // Only use this on dates that have been confidently written using printDateTime
  def unsafeParseDateTime(string: String): DateTime =
    dateTimeFormat.parseDateTime(string)

  def parseDateTime(string: String): Option[DateTime] =
    Try(parseDateTimeFormat.parseDateTime(string)).toOption
  def parseOptDateTime(string: Option[String]): Option[DateTime] = string.flatMap(parseDateTime)

  /** Parses either a UTC timestamp, or a duration before the current time (e.g. "30.days") */
  def parseDateFromQuery(string: String): Option[DateTime] =
    parseDateTime(string) orElse (parseDuration(string) map (DateTime.now minus _.toMillis))

  def parseDuration(string: String): Option[Duration] =
    Try(Duration(string)).toOption
}
