package controllers

import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserMode, ServiceHosts, Services}
import lib.KahunaConfig
import org.mockito.Mockito.when
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.Configuration
import play.api.libs.json.{JsObject, Json}
import play.api.test.Helpers.stubControllerComponents

import scala.concurrent.ExecutionContext

class KahunaControllerTest extends AnyFunSuite with Matchers with MockitoSugar {
  private implicit val ec: ExecutionContext = ExecutionContext.global
  private val email = "someone@example.com"
  private val salt = "test-only-hmac-secret"
  private val user = UserPrincipal("Some", "One", email)
  private val enabled = SentryConfig(
    Configuration("sentry.dsn" -> "https://key@sentry.example.com/1", "sentry.user.salt" -> salt),
    stage = "TEST",
    isDev = false
  )

  private def clientConfig(sentry: SentryConfig, principal: Option[Principal] = Some(user)): JsObject = {
    val config = mock[KahunaConfig]
    when(config.sentryConfig).thenReturn(sentry)
    when(config.services).thenReturn(new Services("example.com", ServiceHosts.guardianPrefixes, Set.empty))
    val controller = new KahunaController(
      authentication = mock[Authentication],
      config = config,
      controllerComponents = stubControllerComponents(),
      authorisation = mock[Authorisation],
      release = "test-release"
    )
    Json.parse(controller.sentryClientConfig(principal)).as[JsObject]
  }

  private def assertNoIdentity(config: JsObject): Unit = {
    (config \ "userId").asOpt[String] shouldBe None
    (config \ "userEmail").asOpt[String] shouldBe None
  }

  test("anonymous mode serializes only the derived user id, never email or the secret") {
    val config = clientConfig(enabled)
    (config \ "userId").as[String] shouldBe
      enabled.userIdentity(email, isPersonalData = true).flatMap(_.id).get
    (config \ "userEmail").asOpt[String] shouldBe None
    Json.stringify(config) should not include email
    Json.stringify(config) should not include salt
  }

  test("anonymous mode without a salt serializes no personal identity") {
    assertNoIdentity(clientConfig(enabled.copy(userSalt = None)))
  }

  test("email mode serializes email rather than a derived id") {
    val config = clientConfig(enabled.copy(userMode = SentryUserMode.Email))
    (config \ "userEmail").as[String] shouldBe email
    (config \ "userId").asOpt[String] shouldBe None
    Json.stringify(config) should not include salt
  }

  test("disabled reporting serializes no identity in either mode") {
    Seq(SentryUserMode.Anonymous, SentryUserMode.Email).foreach { mode =>
      assertNoIdentity(clientConfig(enabled.copy(dsn = None, userMode = mode)))
    }
  }

  test("an unauthenticated page has no Sentry identity") {
    assertNoIdentity(clientConfig(enabled, None))
  }

  test("service principals serialize their service id, not an email") {
    val config = clientConfig(enabled, Some(InnerServicePrincipal("media-api")))
    (config \ "userId").as[String] shouldBe "media-api"
    (config \ "userEmail").asOpt[String] shouldBe None
  }
}
