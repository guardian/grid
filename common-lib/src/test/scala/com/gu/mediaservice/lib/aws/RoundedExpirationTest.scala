package com.gu.mediaservice.lib.aws

import org.joda.time.{DateTime, Duration}
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.must.Matchers.convertToAnyMustWrapper

class RoundedExpirationTest extends AnyFunSuiteLike with RoundedExpiration {

  test("should provide an expiration date in the near future") {
    val expires = cachableExpiration()

    expires.isAfter(DateTime.now) mustBe true
    expires.isBefore(DateTime.now.plusHours(1)) mustBe true
  }

  test("should improve chances of a cache hit by rounding to similar input times to the same value") {
    val now = new DateTime(2024, 8, 7, 12, 26, 34, 343)
    val soon = now.plusSeconds(7);

    cachableExpiration(now) mustEqual cachableExpiration(soon)
  }

  test("should always give an expiration time at least 10 minutes into the future") {
    val now = new DateTime(2024, 8, 7, 12, 20, 0, 0)
    val durations = Range.inclusive(0, 20).map { i =>
      val time = now.plusMinutes(i)
      new Duration(time, cachableExpiration(time))
    }
    durations.forall(_.getStandardMinutes >= 10) mustBe true
  }

}
