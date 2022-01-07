package com.gu.mediaservice.lib.guardian.auth

import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.must.Matchers

import java.time.Instant

class PandaAuthenticationProviderTest extends AnyFunSuite with Matchers {
  import com.gu.mediaservice.lib.guardian.auth.PandaAuthenticationProvider.validateUser

  val user: AuthenticatedUser = AuthenticatedUser(User("Barry", "Chuckle", "barry.chuckle@guardian.co.uk", None),
    "media-service", Set("media-service"), Instant.now().plusSeconds(100).toEpochMilli, multiFactor = true)

  test("user fails email domain validation") {
    validateUser(user, "chucklevision.biz", None) must be(false)
  }

  test("user passes email domain validation") {
    validateUser(user, "guardian.co.uk", None) must be(true)
  }

  test("user passes mfa check if no mfa checker configured") {
    validateUser(user.copy(multiFactor = false), "guardian.co.uk", None) must be(true)
  }

  test("user fails mfa check if missing mfa") {
    validateUser(user.copy(multiFactor = false), "guardian.co.uk", Some(null)) must be(false)
  }

  test("user passes mfa check") {
    validateUser(user, "guardian.co.uk", Some(null)) must be(true)
  }
}
