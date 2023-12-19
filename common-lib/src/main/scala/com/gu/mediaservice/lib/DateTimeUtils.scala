package com.gu.mediaservice.lib

import java.time.format.DateTimeFormatter
import java.time.{Instant, LocalDateTime, ZoneId, ZonedDateTime}
import org.joda.time.DateTime

import java.time.temporal.ChronoUnit
import scala.concurrent.duration.{DurationLong, FiniteDuration}
import scala.util.Try

object DateTimeUtils {
  private val EuropeLondonZone: ZoneId = ZoneId.of("Europe/London")

  def now(): ZonedDateTime = ZonedDateTime.now(EuropeLondonZone)

  def toString(zonedDateTime: ZonedDateTime): String = zonedDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

  def toString(instant: Instant): String = instant.atZone(EuropeLondonZone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

  // TODO move this to a LocalDateTime
  def fromValueOrNow(value: Option[String]): DateTime = Try{new DateTime(value.get)}.getOrElse(DateTime.now)

  def timeUntilNextInterval(interval: FiniteDuration, now: ZonedDateTime = now): FiniteDuration = {
    val nowRoundedDownToTheHour = now.truncatedTo(ChronoUnit.HOURS)
    val millisSinceTheHour = ChronoUnit.MILLIS.between(nowRoundedDownToTheHour, now).toDouble
    val numberOfIntervals = (millisSinceTheHour / interval.toMillis).ceil.toLong
    ChronoUnit.MILLIS.between(
      now,
      nowRoundedDownToTheHour plusSeconds (interval mul numberOfIntervals).toSeconds
    ).millis
  }
}
