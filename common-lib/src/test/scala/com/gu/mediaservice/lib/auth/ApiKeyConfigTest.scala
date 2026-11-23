package com.gu.mediaservice.lib.auth

import org.scalatest.funsuite.AnyFunSuiteLike

import java.time.Instant
import java.time.temporal.ChronoUnit

class ApiKeyConfigTest extends AnyFunSuiteLike {

  private val oneDaySeconds = 60L * 60 * 24

  // Allow a few seconds of tolerance for execution time between the method
  // capturing `Instant.now()` and the test recomputing the expected value.
  private def assertExpiresInDays(result: Option[Instant], days: Long): Unit = {
    val expected = Instant.now().plusSeconds(oneDaySeconds * days)
    result match {
      case Some(instant) =>
        val diffSeconds = math.abs(ChronoUnit.SECONDS.between(instant, expected))
        assert(diffSeconds <= 5, s"expected expiry ~$days day(s) from now but was $instant (diff ${diffSeconds}s)")
      case None =>
        fail(s"expected an expiry ~$days day(s) from now but got None")
    }
  }

  test("developer keys default to a one-day expiry when no expiryDays is given") {
    assertExpiresInDays(ApiKeyConfig.expiry(None, Developer), ApiKeyConfig.defaultExpiryDays)
  }

  test("machine keys have no expiry when no expiryDays is given") {
    assert(ApiKeyConfig.expiry(None, Machine).isEmpty)
  }

  test("an explicit expiryDays is honoured for developer keys") {
    assertExpiresInDays(ApiKeyConfig.expiry(Some(5), Developer), 5)
  }

  test("an explicit expiryDays is honoured for machine keys") {
    assertExpiresInDays(ApiKeyConfig.expiry(Some(5), Machine), 5)
  }

  test("expiryDays of zero falls back to the default for developer keys") {
    assertExpiresInDays(ApiKeyConfig.expiry(Some(0), Developer), ApiKeyConfig.defaultExpiryDays)
  }

  test("a negative expiryDays falls back to the default for developer keys") {
    assertExpiresInDays(ApiKeyConfig.expiry(Some(-3), Developer), ApiKeyConfig.defaultExpiryDays)
  }

  test("an invalid (zero/negative) expiryDays leaves machine keys without an expiry") {
    assert(ApiKeyConfig.expiry(Some(0), Machine).isEmpty)
    assert(ApiKeyConfig.expiry(Some(-3), Machine).isEmpty)
  }

}
