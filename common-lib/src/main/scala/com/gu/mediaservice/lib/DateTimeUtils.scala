package com.gu.mediaservice.lib

import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.{Instant, OffsetDateTime, ZoneId, ZonedDateTime}
import scala.concurrent.duration.{DurationLong, FiniteDuration}
import scala.util.Try

object DateTimeUtils {
  private val EuropeLondonZone: ZoneId = ZoneId.of("Europe/London")

  def now(): ZonedDateTime = ZonedDateTime.now(EuropeLondonZone)

  def toString(zonedDateTime: ZonedDateTime): String = zonedDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

  def toString(instant: Instant): String = instant.atZone(EuropeLondonZone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)

  private def parseAsInstant(raw: String): Option[Instant] =
    Try { Instant.parse(raw) }.toOption

  private def parseAsOffset(raw: String): Option[OffsetDateTime] =
    Try { OffsetDateTime.parse(raw) }.toOption

  private def parseAsZoned(raw: String): Option[ZonedDateTime] =
    Try { ZonedDateTime.parse(raw) }.toOption

  private def fromValue(value: String): Option[Instant] =
    parseAsZoned(value).map(_.toInstant) orElse parseAsOffset(value).map(_.toInstant) orElse parseAsInstant(value)

  // TODO move this to a LocalDateTime?
  def fromValueOrNow(value: Option[String]): Instant =
    value.flatMap(fromValue).getOrElse(Instant.now)

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
