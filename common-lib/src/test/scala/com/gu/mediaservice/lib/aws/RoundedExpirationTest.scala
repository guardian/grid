package com.gu.mediaservice.lib.aws
import org.joda.time.DateTime
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.must.Matchers.convertToAnyMustWrapper


class RoundedExpirationTest extends AnyFunSuiteLike with  RoundedExpiration {

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

}
