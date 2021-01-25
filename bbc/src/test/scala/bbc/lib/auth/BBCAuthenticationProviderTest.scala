package bbc.lib.auth

import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import com.typesafe.scalalogging.StrictLogging
import org.scalatest.{FunSuite, MustMatchers}

import java.time.Instant

class BBCAuthenticationProviderTest extends FunSuite with MustMatchers with StrictLogging {
  import bbc.lib.auth.BBCAuthenticationProvider.validateUser

  val user: AuthenticatedUser = AuthenticatedUser(User("Barry", "Chuckle", "barry.chuckle@bbc.co.uk", None),
    "media-service", Set("media-service"), Instant.now().plusSeconds(100).toEpochMilli, multiFactor = true)

  test("user fails email domain validation") {
    validateUser(
      authedUser = user,
      validEmails = Some(List("barry.chuckle@bbc.co.uk")),
      multifactorChecker = None,
      usePermissionsValidation = false,
      userValidationEmailDomain = "chucklevision.biz",
      logger = logger
    ) must be(false)
  }

  test("user passes email domain validation") {
    validateUser(
      authedUser = user,
      validEmails = Some(List("barry.chuckle@bbc.co.uk")),
      multifactorChecker = None,
      usePermissionsValidation = false,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(true)
  }

  test("user passes mfa check if no mfa checker configured") {
    validateUser(
      authedUser = user.copy(multiFactor = false),
      validEmails = Some(List("barry.chuckle@bbc.co.uk")),
      multifactorChecker = None,
      usePermissionsValidation = false,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(true)
  }

  test("user fails mfa check if missing mfa") {
    validateUser(
      authedUser = user.copy(multiFactor = false),
      validEmails = Some(List("barry.chuckle@bbc.co.uk")),
      multifactorChecker = Some(null),
      usePermissionsValidation = false,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(false)
  }

  test("user passes mfa check") {
    validateUser(
      authedUser = user,
      validEmails = Some(List("barry.chuckle@bbc.co.uk")),
      multifactorChecker = Some(null),
      usePermissionsValidation = false,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(true)
  }

  test("user fails permission validation if it doesn't have the correct permissions") {
    validateUser(
      authedUser = user.copy(permissions = Set("permission1", "permission2")),
      validEmails = Some(List("barry.chuckle@bbc.co.uk")),
      multifactorChecker = None,
      usePermissionsValidation = true,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(false)
  }

  test("user passes permission validation if it has the correct permissions") {
    validateUser(
      authedUser = user.copy(permissions = Set("permission1", "permission2", "grid access")),
      validEmails = None,
      multifactorChecker = None,
      usePermissionsValidation = true,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(true)
  }

  test("user doesn't pass email validation if their email is not in the list") {
    validateUser(
      authedUser = user,
      validEmails = Some(List("a@a.com")),
      multifactorChecker = None,
      usePermissionsValidation = false,
      userValidationEmailDomain = "bbc.co.uk",
      logger = logger
    ) must be(false)
  }

}
