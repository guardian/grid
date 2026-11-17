package controllers

import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.config.SentryConfig
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
  private val user = UserPrincipal("Some", "One", email)
  private val enabled = SentryConfig(
    Configuration("sentry.dsn" -> "https://key@sentry.example.com/1"),
    stage = "TEST"
  )

  private def clientConfig(sentry: SentryConfig, principal: Option[Principal] = Some(user)): JsObject = {
    val config = mock[KahunaConfig]
    when(config.sentryConfig).thenReturn(sentry)
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

  test("serializes the signed-in user's email") {
    val config = clientConfig(enabled)
    (config \ "userEmail").as[String] shouldBe email
    (config \ "userId").asOpt[String] shouldBe None
  }

  test("disabled reporting serializes no identity") {
    assertNoIdentity(clientConfig(enabled.copy(dsn = None)))
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
