package com.gu.mediaservice.lib

import java.time.format.DateTimeFormatter
import java.time.{Instant, LocalDateTime, ZoneId, ZonedDateTime}
import org.joda.time.DateTime
import org.joda.time.format.DateTimeFormat

import java.time.temporal.ChronoUnit
import java.util.Locale
import scala.concurrent.duration.{DurationLong, FiniteDuration}
import scala.util.Try

object DateTimeUtils {
  private val EuropeLondonZone: ZoneId = ZoneId.of("Europe/London")

  def now(): ZonedDateTime = ZonedDateTime.now(EuropeLondonZone)

  def toString(zonedDateTime: ZonedDateTime): String = zonedDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

  def toString(instant: Instant): String = instant.atZone(EuropeLondonZone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

  // TODO move this to a LocalDateTime
  def fromValueOrNow(value: Option[String]): DateTime = Try{new DateTime(value.get)}.getOrElse(DateTime.now)

  def timeUntilNextInterval(interval: FiniteDuration, now: ZonedDateTime = DateTimeUtils.now()): FiniteDuration = {
    val nowRoundedDownToTheHour = now.truncatedTo(ChronoUnit.HOURS)
    val millisSinceTheHour = ChronoUnit.MILLIS.between(nowRoundedDownToTheHour, now).toDouble
    val numberOfIntervals = (millisSinceTheHour / interval.toMillis).ceil.toLong
    ChronoUnit.MILLIS.between(
      now,
      nowRoundedDownToTheHour plusSeconds (interval mul numberOfIntervals).toSeconds
    ).millis
  }
}

object PartialDate {
  private val formats = List(
    ("d MMMM, yyyy", true),
    ("d MMM, yyyy", true),
    ("d MMMM yyyy", true),
    ("d MMM yyyy", true),
    ("d MMMM", false),
    ("d MMM", false)
  ).map { case (pattern, hasYear) =>
    DateTimeFormat.forPattern(pattern).withLocale(Locale.ENGLISH) -> hasYear
  }

  def parse(value: String): Option[PartialDate] =
    formats.view.flatMap { case (formatter, hasYear) =>
      Try(formatter.parseDateTime(value.trim)).toOption.map { date =>
        PartialDate(
          day = date.getDayOfMonth,
          month = date.getMonthOfYear,
          year = Option.when(hasYear)(date.getYear)
        )
      }
    }.headOption
}

case class PartialDate(day: Int, month: Int, year: Option[Int]) {
  def matches(timestamp: DateTime): Boolean =
    Math.abs(timestamp.getDayOfMonth - day) <= 1 &&
      timestamp.getMonthOfYear == month &&
      year.forall(_ == timestamp.getYear)
}
