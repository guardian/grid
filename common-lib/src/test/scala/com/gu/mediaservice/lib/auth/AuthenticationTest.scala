package com.gu.mediaservice.lib.auth

import java.time.Instant

import com.gu.pandomainauth.model.{AuthenticatedUser, User}
import org.scalatest.{FunSuite, MustMatchers}

class AuthenticationTest extends FunSuite with MustMatchers {
  import Authentication.validateUser

  val email = "barry.chuckle@guardian.co.uk"
  val emailList =  Some(List(email))
  val user = AuthenticatedUser(User("Barry", "Chuckle", email, None),
    "media-service", Set("media-service"), Instant.now().plusSeconds(100).toEpochMilli, multiFactor = true, Set("Grid Access"))

  test("user fails email domain validation") {
    validateUser(user, "chucklevision.biz", None, emailList) must be(false)
  }
  
// replaced with PP integration
//  test("user fails email validation") {
//    validateUser(user, "guardian.co.uk", None, Some(List("valid.email@guardian.co.uk"))) must be(false)
//  }

  test("user passes email domain validation") {
    validateUser(user, "guardian.co.uk", None, emailList) must be(true)
  }

  test("user passes mfa check if no mfa checker configured") {
    validateUser(user.copy(multiFactor = false), "guardian.co.uk", None, emailList) must be(true)
  }

  test("user fails mfa check if missing mfa") {
    validateUser(user.copy(multiFactor = false), "guardian.co.uk", Some(null), emailList) must be(false)
  }

  test("user passes mfa check") {
    validateUser(user, "guardian.co.uk", Some(null), emailList) must be(true)
  }
}
