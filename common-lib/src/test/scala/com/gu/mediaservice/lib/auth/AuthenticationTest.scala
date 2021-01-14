package com.gu.mediaservice.lib.auth

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import com.gu.mediaservice.lib.auth.Authentication.{ApiKeyAccessor, GridUser}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.config.CommonConfig
import org.scalatest.{AsyncFreeSpec, BeforeAndAfterAll, EitherValues, Matchers}
import play.api.Configuration
import play.api.http.Status
import play.api.libs.json.{Format, Json}
import play.api.libs.ws.WSRequest
import play.api.mvc.{Cookie, DiscardingCookie, PlayBodyParsers, RequestHeader, Result}
import play.api.test.Helpers.defaultAwaitTimeout
import play.api.test.{FakeRequest, Helpers}

import scala.concurrent.ExecutionContext.global
import scala.concurrent.Future
import scala.util.Try

//noinspection NotImplementedCode,SpellCheckingInspection
class AuthenticationTest extends AsyncFreeSpec with Matchers with EitherValues with BeforeAndAfterAll {

  implicit val actorSystem: ActorSystem = ActorSystem()
  implicit val materializer: ActorMaterializer = ActorMaterializer()

  private val COOKIE_NAME = "TestGridAuth"
  private val HEADER_NAME = "X-TestMachine-Auth"
  private case class AuthToken(firstName: String, lastName: String, email: String, expired: Boolean, veryExpired: Boolean) {
    def user: GridUser = GridUser(firstName, lastName, email)
  }
  private implicit val cookieFormats: Format[AuthToken] = Json.format[AuthToken]
  private def makeCookie(firstName: String = "Test", lastName: String = "User", email: String = "test@user", expired: Boolean = false, veryExpired: Boolean = false): Cookie = {
    val data = AuthToken(firstName, lastName, email, expired, veryExpired)
    val value = Json.stringify(Json.toJson(data))
    Cookie(COOKIE_NAME, value)
  }
  private def parseCookie(cookie: Cookie): Option[AuthToken] = {
    Try(Json.parse(cookie.value)).toOption.flatMap(_.asOpt[AuthToken])
  }

  "authenticationStatus" - {
    val config = new CommonConfig(Configuration.from(Map(
      "grid.stage" -> "TEST",
      "grid.appName" -> "test",
      "thrall.kinesis.stream.name" -> "not-used",
      "thrall.kinesis.lowPriorityStream.name" -> "not-used",
      "domain.root" -> "notused.example.com"
    ))) {}

    val testProviders = AuthenticationProviders(
      new UserAuthenticationProvider {
        override def authenticateRequest(request: RequestHeader): AuthenticationStatus = {
          request.cookies.get(COOKIE_NAME) match {
            case None => NotAuthenticated
            case Some(cookie) =>
              parseCookie(cookie) match {
                case None => Invalid("Token not valid")
                case Some(token@AuthToken(_, _, _, true, false)) => GracePeriod(token.user)
                case Some(token@AuthToken(_, _, _, _, true)) => Expired(token.user)
                case Some(token) if token.email == "test@user" => Authenticated(token.user)
                case Some(token) => NotAuthorised(s"${token.email} not authorised")
              }
          }
        }

        override def sendForAuthentication: Option[RequestHeader => Future[Result]] = ???
        override def processAuthentication: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] = ???
        override def flushToken: Option[(RequestHeader, Result) => Result] = Some({(_: RequestHeader, result: Result) =>
          result.discardingCookies(DiscardingCookie(COOKIE_NAME))
        })
        override def onBehalfOf(request: Authentication.Principal): Either[String, WSRequest => WSRequest] = ???
      },
      new MachineAuthenticationProvider {
        override def authenticateRequest(request: RequestHeader): ApiAuthenticationStatus = {
          request.headers.get(HEADER_NAME) match {
            case None => NotAuthenticated
            case Some(key) if key.startsWith("key-") && key.endsWith("-blocked") => NotAuthorised(s"$key is blocked")
            case Some(key) if key.startsWith("key-") => Authenticated(ApiKeyAccessor(ApiAccessor(key, Internal)))
            case Some(_) => Invalid("Key doesn't start with 'key-'")
          }
        }
        override def onBehalfOf(request: Authentication.Principal): Either[String, WSRequest => WSRequest] = ???
      }
    )

    val auth = new Authentication(
      config = config,
      providers = testProviders,
      parser = PlayBodyParsers().default,
      executionContext = global
    )
    "should return unauthorised if request is empty (no headers)" in {
      val authStatus = auth.authenticationStatus(FakeRequest())
      authStatus.left.value.map { result =>
        result.header.status shouldBe Status.UNAUTHORIZED
        Helpers.contentAsJson(Future.successful(result)).\("errorKey").as[String] shouldBe "authentication-failure"
      }
    }
    "should return invalid if the cookie is present but invalid" in {
      val request = FakeRequest().withCookies(Cookie(COOKIE_NAME, "garbage"))
      val authStatus = auth.authenticationStatus(request)
      authStatus.left.value.map { result =>
        result.header.status shouldBe Status.UNAUTHORIZED
        Helpers.contentAsJson(Future.successful(result)).\("errorKey").as[String] shouldBe "authentication-failure"
      }
    }
    "should return user when valid" in {
      val request = FakeRequest().withCookies(makeCookie())
      val authStatus = auth.authenticationStatus(request)
      authStatus.right.value shouldBe GridUser("Test", "User", "test@user")
    }
    "should return user when expired but in grace period" in {
      val request = FakeRequest().withCookies(makeCookie(expired = true))
      val authStatus = auth.authenticationStatus(request)
      authStatus.right.value shouldBe GridUser("Test", "User", "test@user")
    }
    "should return 419 when expired" in {
      val request = FakeRequest().withCookies(makeCookie(veryExpired = true))
      val authStatus = auth.authenticationStatus(request)
      authStatus.left.value.map { result =>
        result.header.status shouldBe 419
        Helpers.contentAsJson(Future.successful(result)).\("errorKey").as[String] shouldBe "authentication-expired"
      }
    }
    "should return forbidden when user is not authorised by provider" in {
      val request = FakeRequest().withCookies(makeCookie(email = "l33t@hacker"))
      val authStatus = auth.authenticationStatus(request)
      authStatus.left.value.map { result =>
        result.header.status shouldBe Status.FORBIDDEN
        Helpers.contentAsJson(Future.successful(result)).\("errorKey").as[String] shouldBe "principal-not-authorised"
      }
    }
    "should authenticate with an API key" in {
      val request = FakeRequest().withHeaders(HEADER_NAME -> "key-client")
      val authStatus = auth.authenticationStatus(request)
      authStatus.right.value shouldBe ApiKeyAccessor(ApiAccessor("key-client", Internal))
    }
    "should return unauthorised when the API key is garbage" in {
      val request = FakeRequest().withHeaders(HEADER_NAME -> "garbage")
      val authStatus = auth.authenticationStatus(request)
      authStatus.left.value.map { result =>
        result.header.status shouldBe Status.UNAUTHORIZED
        Helpers.contentAsJson(Future.successful(result)).\("errorKey").as[String] shouldBe "authentication-failure"
      }
    }
    "should return forbidden if valid key is blocked" in {
      val request = FakeRequest().withHeaders(HEADER_NAME -> "key-is-blocked")
      val authStatus = auth.authenticationStatus(request)
      authStatus.left.value.map { result =>
        result.header.status shouldBe Status.FORBIDDEN
        Helpers.contentAsJson(Future.successful(result)).\("errorKey").as[String] shouldBe "principal-not-authorised"
      }
    }
    "should prioritise machine authentication over user authentication" in {
      val request = FakeRequest().withCookies(makeCookie()).withHeaders(HEADER_NAME -> "key-client")
      val authStatus = auth.authenticationStatus(request)
      authStatus.right.value shouldBe ApiKeyAccessor(ApiAccessor("key-client", Internal))
    }
  }
}
