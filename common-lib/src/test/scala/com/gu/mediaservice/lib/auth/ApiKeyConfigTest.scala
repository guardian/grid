package com.gu.mediaservice.lib.auth

import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers

class ApiKeyConfigTest extends AnyFunSuiteLike with Matchers {

  test("developer keys default to a one-day expiry when no expiryDays is given") {
    ApiKeyConfig.resolveExpiry(None, Developer) shouldEqual Some(Day)
  }

  test("machine keys have no expiry when no expiryDays is given") {
    ApiKeyConfig.resolveExpiry(None, Machine) shouldEqual None
  }

  test("an explicit expiryDays is honoured for developer keys") {
    ApiKeyConfig.resolveExpiry(Some(Week), Developer) shouldEqual Some(Week)
  }

  test("an explicit expiryDays is honoured for machine keys") {
    ApiKeyConfig.resolveExpiry(Some(Week), Machine) shouldEqual Some(Week)
  }
}
