package com.gu.mediaservice.lib.auth

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, OnBehalfOfPrincipal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProvider.RedirectUri
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.config.{CommonConfig, TestProvider}
import org.scalatest.{AsyncFreeSpec, BeforeAndAfterAll, EitherValues, Matchers}
import org.scalatestplus.play.PlaySpec
import play.api.{Configuration, Environment}
import play.api.http.Status
import play.api.libs.json.{Format, Json}
import play.api.libs.typedmap.{TypedKey, TypedMap}
import play.api.libs.ws.{DefaultWSCookie, WSRequest}
import play.api.mvc.{Cookie, DiscardingCookie, PlayBodyParsers, RequestHeader, Result}
import play.api.test.Helpers.defaultAwaitTimeout
import play.api.test.{FakeRequest, Helpers, WsTestClient}
import play.libs.ws.WSCookie

import java.lang.IllegalStateException
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
    def user: UserPrincipal = UserPrincipal(firstName, lastName, email)
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

  def makeAuthenticationInstance(testProviders: AuthenticationProviders): Authentication = {
    val config = new CommonConfig(Configuration.load(Environment.simple())) {}
    new Authentication(
      config = config,
      providers = testProviders,
      parser = PlayBodyParsers().default,
      executionContext = global
    )
  }

  "authenticationStatus" - {
    val testProviders = AuthenticationProviders(
      new UserAuthenticationProvider {
        override def authenticateRequest(request: RequestHeader): AuthenticationStatus = {
          request.cookies.get(COOKIE_NAME) match {
            case None => NotAuthenticated
            case Some(cookie) =>
              parseCookie(cookie) match {
                case None => Invalid("Token not valid")
                case Some(token@AuthToken(_, _, _, _, true)) => Expired(token.user)
                case Some(token) if token.email == "test@user" => Authenticated(token.user)
                case Some(token) => NotAuthorised(s"${token.email} not authorised")
              }
          }
        }

        override def sendForAuthentication: Option[RequestHeader => Future[Result]] = ???
        override def sendForAuthenticationCallback: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] = ???
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
            case Some(key) if key.startsWith("key-") => Authenticated(MachinePrincipal(ApiAccessor(key, Internal)))
            case Some(_) => Invalid("Key doesn't start with 'key-'")
          }
        }
        override def onBehalfOf(request: Authentication.Principal): Either[String, WSRequest => WSRequest] = ???
      }
    )

    val auth = makeAuthenticationInstance(testProviders)

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
      authStatus.right.value shouldBe UserPrincipal("Test", "User", "test@user")
    }
    "should return user when expired but in grace period" in {
      val request = FakeRequest().withCookies(makeCookie(expired = true))
      val authStatus = auth.authenticationStatus(request)
      authStatus.right.value shouldBe UserPrincipal("Test", "User", "test@user")
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
      authStatus.right.value shouldBe MachinePrincipal(ApiAccessor("key-client", Internal))
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
      authStatus.right.value shouldBe MachinePrincipal(ApiAccessor("key-client", Internal))
    }
  }

  "getOnBehalfOfPrincipal" - {
    val CookieKey: TypedKey[Cookie] = TypedKey("cookie-key")
    val HeaderKey: TypedKey[(String, String)] = TypedKey("header-key")
    val testProviders = AuthenticationProviders(
      new UserAuthenticationProvider {
        override def authenticateRequest(request: RequestHeader): AuthenticationStatus = ???
        override def sendForAuthentication: Option[RequestHeader => Future[Result]] = ???
        override def sendForAuthenticationCallback: Option[(RequestHeader, Option[RedirectUri]) => Future[Result]] = ???
        override def flushToken: Option[(RequestHeader, Result) => Result] = ???
        override def onBehalfOf(request: Authentication.Principal): Either[String, WSRequest => WSRequest] = request match {
          case UserPrincipal(_,_,_,attributes) if attributes.contains(CookieKey) => Right(req => req.addCookies(DefaultWSCookie(COOKIE_NAME, attributes.get(CookieKey).get.value)))
          case UserPrincipal(_, _, email, _) => Left(s"Unable to build onBehalfOf function for $email")
        }
      },
      new MachineAuthenticationProvider {
        override def authenticateRequest(request: RequestHeader): ApiAuthenticationStatus = ???
        override def onBehalfOf(request: Authentication.Principal): Either[String, WSRequest => WSRequest] = request match {
          case MachinePrincipal(_, attributes) if attributes.contains(HeaderKey) => Right(req => req.addHttpHeaders(attributes.get(HeaderKey).get))
          case MachinePrincipal(ApiAccessor(identity, _), _) => Left(s"Unable to build onBehalfOf function for $identity")
        }
      }
    )
    val auth: Authentication = makeAuthenticationInstance(testProviders)

    "return function for user principal" in {
      val testUser = UserPrincipal("Test", "User", "test@user", TypedMap(CookieKey -> Cookie(COOKIE_NAME, "this is my cookie value")))
      val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(testUser)
      WsTestClient.withClient{ client =>
        val req = client.url("https://example.com")
        val modifiedReq = onBehalfOfFn(req)
        val maybeCookie = modifiedReq.cookies.find(_.name == COOKIE_NAME)
        maybeCookie.nonEmpty shouldBe true
        maybeCookie.get.name shouldBe COOKIE_NAME
        maybeCookie.get.value shouldBe "this is my cookie value"
      }
    }

    "fail to get function for user principal if the user doesn't have the cookie" in {
      val testUser = UserPrincipal("Test", "User", "test@user")
      the [IllegalStateException] thrownBy {
        val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(testUser)
      } should have message "Unable to build onBehalfOf function for test@user"
    }

    "return function for machine principal" in {
      val apiAccessor = MachinePrincipal(ApiAccessor("my-client-id", Internal), TypedMap(HeaderKey -> (HEADER_NAME -> "my-client-id-key")))
      val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(apiAccessor)
      WsTestClient.withClient{ client =>
        val req = client.url("https://example.com")
        val modifiedReq = onBehalfOfFn(req)
        val maybeHeader = modifiedReq.headers.get(HEADER_NAME)
        maybeHeader.nonEmpty shouldBe true
        maybeHeader.get.head shouldBe "my-client-id-key"
      }
    }

    "fail to get function for user principal if the api accessor doesn't have the header" in {
      val apiAccessor = MachinePrincipal(ApiAccessor("my-client-id", Internal))
      the [IllegalStateException] thrownBy {
        val onBehalfOfFn: OnBehalfOfPrincipal = auth.getOnBehalfOfPrincipal(apiAccessor)
      } should have message "Unable to build onBehalfOf function for my-client-id"
    }
  }
}
