package com.gu.mediaservice.lib

import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat


package object formatting {

  private val dateTimeFormat = ISODateTimeFormat.dateTimeNoMillis.withZoneUTC

  def printDateTime(date: DateTime): String = dateTimeFormat.print(date)

}
