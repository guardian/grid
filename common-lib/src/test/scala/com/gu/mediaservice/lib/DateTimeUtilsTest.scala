package com.gu.mediaservice.lib

import org.joda.time.DateTime
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import scala.concurrent.duration.{DurationInt, DurationLong, FiniteDuration}


class DateTimeUtilsTest extends AnyFunSpec with Matchers {
  it ("should convert a string to a DateTime") {
    val dateString = "2020-01-01T12:34:56.000Z"
    val actual = DateTimeUtils.fromValueOrNow(Some(dateString))
    actual shouldBe a[DateTime]
    actual.toString shouldBe dateString
  }

  it ("should handle an invalid date string input and return a DateTime") {
    val actual = DateTimeUtils.fromValueOrNow(Some("nonsense"))
    actual shouldBe a[DateTime]
  }

  it ("should return a date with no input") {
    val actual = DateTimeUtils.fromValueOrNow(None)
    actual shouldBe a[DateTime]
  }

  it ("should return the time until the next instance of the interval relative to the hour"){
    def toZonedDateTime(timePart: String) = ZonedDateTime.parse(s"2023-11-21T${timePart}Z[Europe/London]")
    def test(nowTime: String, expectedTime: String, interval: FiniteDuration = 15.minutes) = {
      DateTimeUtils.timeUntilNextInterval(
        interval,
        toZonedDateTime(nowTime)
      ) shouldEqual ChronoUnit.MILLIS.between(
        toZonedDateTime(nowTime),
        toZonedDateTime(expectedTime)
      ).millis
    }
    test(nowTime = "11:11:23.887", expectedTime = "11:15:00.000")
    test(nowTime = "11:23:23.887", expectedTime = "11:30:00.000")
    test(nowTime = "11:33:23.887", expectedTime = "11:45:00.000")
    test(nowTime = "11:50:23.887", expectedTime = "12:00:00.000")
    test(nowTime = "11:00:00.000", expectedTime = "11:00:00.000")
    test(nowTime = "11:00:00.001", expectedTime = "11:15:00.000")

    test(nowTime = "11:00:00.001", expectedTime = "11:01:00.000", interval = 1.minute)
    test(nowTime = "11:00:00.001", expectedTime = "11:02:00.000", interval = 2.minute)

    test(nowTime = "11:01:00.001", expectedTime = "12:00:00.000", interval = 1.hour)
  }
}
