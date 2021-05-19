package com.gu.mediaservice.lib.auth

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.auth.Authentication.MachinePrincipal
import com.gu.mediaservice.lib.auth.provider.{ApiKeyAuthenticationProvider, Authenticated, AuthenticationProviderResources, Invalid, NotAuthenticated, NotAuthorised}
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import org.scalatest.Inside.inside
import org.scalatest.{AsyncFreeSpec, BeforeAndAfterAll, EitherValues, Matchers}
import play.api.inject.ApplicationLifecycle
import play.api.mvc.DefaultControllerComponents
import play.api.test.{FakeRequest, WsTestClient}
import play.api.{Configuration, Environment}

import scala.concurrent.ExecutionContext.global
import scala.concurrent.Future

//noinspection NotImplementedCode,SpellCheckingInspection
class ApiKeyAuthenticationProviderTest extends AsyncFreeSpec with Matchers with EitherValues with BeforeAndAfterAll {

  private val actorSystem: ActorSystem = ActorSystem()
  private val wsClient = new WsTestClient.InternalWSClient("https", 443)
  private val applicationLifecycle = new ApplicationLifecycle {
    override def addStopHook(hook: () => Future[_]): Unit = {}
    override def stop(): Future[_] = Future.successful(())
  }
  private val config = new CommonConfig(GridConfigResources(
    Configuration.load(Environment.simple()),
    actorSystem,
    applicationLifecycle
  )){}
  private val providerConfig = Configuration.empty
  private val controllerComponents: DefaultControllerComponents = DefaultControllerComponents(null, null, null, null, null, global)
  private val resources = AuthenticationProviderResources(config, actorSystem, wsClient, controllerComponents)
  private val provider = new ApiKeyAuthenticationProvider(providerConfig, resources) {
    override def initialise(): Unit = { /* do nothing */ }

    override def shutdown(): Future[Unit] = { /* do nothing */
      Future.successful(())
    }

    override def keyStore: KeyStore = new KeyStore("not-used", resources.commonConfig) {
      override def lookupIdentity(key: String): Option[ApiAccessor] = {
        key match {
          case "key-chuckle" => Some(ApiAccessor("brothers", Internal))
          case "key-limited" => Some(ApiAccessor("locked-down", ReadOnly))
          case _ => None
        }
      }
    }
  }

  "requestAuthentication" - {
    "should return Authenticated if the key is valid" in {
      val testHeader = ApiKeyAuthenticationProvider.apiKeyHeaderName -> "key-chuckle"
      val status = provider.authenticateRequest(FakeRequest().withHeaders(testHeader))
      inside(status) {
        case Authenticated(MachinePrincipal(apiAccessor, attributes)) =>
          apiAccessor shouldBe ApiAccessor("brothers", Internal)
          attributes.contains(ApiKeyAuthenticationProvider.ApiKeyHeader) shouldBe true
          attributes.get(ApiKeyAuthenticationProvider.ApiKeyHeader) shouldBe Some(testHeader)
      }
    }
    "should return NotAuthenticated if the header is missing" in {
      val status = provider.authenticateRequest(FakeRequest())
      status shouldBe NotAuthenticated
    }
    "should return Invalid if the key is invalid" in {
      val testHeader = ApiKeyAuthenticationProvider.apiKeyHeaderName -> "key-banana"
      val status = provider.authenticateRequest(FakeRequest().withHeaders(testHeader))
      inside(status) {
        case Invalid(message, _) =>
          message shouldBe "API key not valid"
      }
    }
    "should return NotAuthorised if the key doesn't have enough permissions" in {
      val testHeader = ApiKeyAuthenticationProvider.apiKeyHeaderName -> "key-limited"
      val status = provider.authenticateRequest(FakeRequest().withHeaders(testHeader).withMethod("POST"))
      inside(status) {
        case NotAuthorised(message) =>
          message shouldBe "API key locked-down valid but not authorised for this request"
      }
    }
  }
}
