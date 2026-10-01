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

  describe("PartialDate.parse") {
    it("should parse supported dates containing a year") {
      val inputs = Seq(
        "13 September, 2020",
        "13 Sep, 2020",
        "13 September 2020",
        "13 Sep 2020"
      )

      inputs.foreach { input =>
        PartialDate.parse(input) shouldBe Some(PartialDate(13, 9, Some(2020)))
      }
    }

    it("should parse supported dates without a year") {
      Seq("13 September", "13 Sep").foreach { input =>
        PartialDate.parse(input) shouldBe Some(PartialDate(13, 9, None))
      }
    }

    it("should parse single-digit and leap-year dates and ignore surrounding whitespace") {
      PartialDate.parse("  1 February 2024  ") shouldBe Some(PartialDate(1, 2, Some(2024)))
      PartialDate.parse("29 Feb 2024") shouldBe Some(PartialDate(29, 2, Some(2024)))
    }

    it("should reject invalid or unsupported dates") {
      Seq(
        "",
        "not a date",
        "September 13 2020",
        "31 February 2020",
        "29 February 2023"
      ).foreach { input =>
        PartialDate.parse(input) shouldBe None
      }
    }
  }

  describe("PartialDate.matches") {
    val timestamp = new DateTime(2020, 9, 13, 12, 0)

    it("should match the same date") {
      PartialDate(13, 9, Some(2020)).matches(timestamp) shouldBe true
    }

    it("should match dates one day either side within the same month") {
      PartialDate(12, 9, Some(2020)).matches(timestamp) shouldBe true
      PartialDate(14, 9, Some(2020)).matches(timestamp) shouldBe true
    }

    it("should not match dates more than one day apart") {
      PartialDate(11, 9, Some(2020)).matches(timestamp) shouldBe false
      PartialDate(15, 9, Some(2020)).matches(timestamp) shouldBe false
    }

    it("should require the month to match, including across a month boundary") {
      PartialDate(13, 10, Some(2020)).matches(timestamp) shouldBe false
      PartialDate(30, 9, Some(2020)).matches(new DateTime(2020, 10, 1, 0, 0)) shouldBe false
    }

    it("should require the year to match when one is present") {
      PartialDate(13, 9, Some(2019)).matches(timestamp) shouldBe false
    }

    it("should ignore the timestamp year when the partial date has no year") {
      PartialDate(13, 9, None).matches(timestamp) shouldBe true
      PartialDate(13, 9, None).matches(new DateTime(2026, 9, 13, 12, 0)) shouldBe true
    }
  }
}
