package com.gu.mediaservice.lib

import scala.util.Try
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat


package object formatting {

  private val dateTimeFormat = ISODateTimeFormat.dateTimeNoMillis.withZoneUTC

  def printDateTime(date: DateTime): String = dateTimeFormat.print(date)

  def parseDateTime(string: String): Option[DateTime] =
    Try(dateTimeFormat.parseDateTime(string)).toOption
}
