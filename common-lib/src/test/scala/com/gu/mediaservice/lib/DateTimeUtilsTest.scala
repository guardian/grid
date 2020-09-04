package com.gu.mediaservice.lib

import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}

class DateTimeUtilsTest extends FunSpec with Matchers {
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
}
