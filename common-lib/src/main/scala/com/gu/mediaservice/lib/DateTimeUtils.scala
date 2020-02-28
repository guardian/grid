package com.gu.mediaservice.lib

import org.joda.time.DateTime

import scala.util.Try

object DateTimeUtils {
  def fromValueOrNow(value: Option[String]): DateTime = Try{new DateTime(value.get)}.getOrElse(DateTime.now)
}
