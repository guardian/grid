package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal}
import com.gu.mediaservice.lib.auth.Permissions.EditMetadata
import com.gu.mediaservice.lib.auth.provider._
import org.apache.pekko.actor.ActorSystem
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.when
import org.mockito.invocation.InvocationOnMock
import org.mockito.stubbing.Answer
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.mvc.{Action, AnyContent, BaseController, ControllerComponents, RequestHeader}
import play.api.test.FakeRequest
import play.api.test.Helpers._

import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.language.reflectiveCalls

class MachineAuthenticationE2ETest extends AnyFunSuite with Matchers with MockitoSugar with BeforeAndAfterAll {
  private implicit val actorSystem: ActorSystem = ActorSystem("machine-auth-e2e-test")
  private implicit val ec: ExecutionContext = ExecutionContext.global

  override protected def afterAll(): Unit = {
    Await.result(actorSystem.terminate(), 10.seconds)
    super.afterAll()
  }

  private class Fixture {
    val machineAuthProvider: MachineAuthenticationProvider = mock[MachineAuthenticationProvider]
    when(machineAuthProvider.authenticateRequest(any[RequestHeader])).thenAnswer(new Answer[AuthenticationStatus] {
      override def answer(invocation: InvocationOnMock): AuthenticationStatus = {
        val request = invocation.getArgument[RequestHeader](0)
        request.headers.get(ApiKeyAuthenticationProvider.apiKeyHeaderName) match {
          case Some(apiKey) =>
            TestApiKeyPermissions.getPermissions(apiKey) match {
              case Some((name, _)) if apiKey == "api-key-internal" =>
                Authenticated(MachinePrincipal(ApiAccessor(name, Internal)))
              case Some((name, permissions)) =>
                Authenticated(MachinePrincipal(ApiAccessor(name, PermissionTier(permissions))))
              case None =>
                Invalid("API key not valid")
            }
          case None =>
            NotAuthenticated
        }
      }
    })

    val authProvider: AuthorisationProvider = mock[AuthorisationProvider]
    when(authProvider.hasPermissionTo(any[SimplePermission](), any[Principal]())).thenAnswer(new Answer[Boolean] {
      override def answer(invocation: InvocationOnMock): Boolean = {
        val permission = invocation.getArgument[SimplePermission](0)
        val principal = invocation.getArgument[Principal](1)

        principal match {
          case MachinePrincipal(ApiAccessor(_, PermissionTier(permissions)), _) =>
            permissions.contains(permission.name)
          case MachinePrincipal(ApiAccessor(_, Internal), _) =>
            true
          case _ => false
        }
      }
    })

    val components = stubControllerComponents()
    val authorisation = new Authorisation(authProvider, ec)

    val testController = new BaseController {
      override protected def controllerComponents: ControllerComponents = components

      def readEndpoint: Action[AnyContent] = Action { implicit request =>
        machineAuthProvider.authenticateRequest(request) match {
          case Authenticated(principal) =>
            Ok("Read successful")
          case NotAuthorised(message) =>
            Forbidden(s"Not authorised: $message")
          case Invalid(message, _) =>
            Forbidden(s"Invalid: $message")
          case NotAuthenticated =>
            Unauthorized("Not authenticated")
        }
      }

      def writeEndpoint: Action[AnyContent] = Action { implicit request =>
        machineAuthProvider.authenticateRequest(request) match {
          case Authenticated(principal) =>
            if (authorisation.hasPermissionTo(EditMetadata)(principal)) {
              Ok("Write successful")
            } else {
              Forbidden("Missing permission: EditMetadata")
            }
          case NotAuthorised(message) =>
            Forbidden(s"Not authorised: $message")
          case Invalid(message, _) =>
            Forbidden(s"Invalid: $message")
          case NotAuthenticated =>
            Unauthorized("Not authenticated")
        }
      }
    }
  }

  test("PermissionTier key should authenticate") {
    val fixture = new Fixture()
    val request = FakeRequest("GET", "/read")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "api-key-with-perms")

    val result = fixture.testController.readEndpoint.apply(request)
    status(result) shouldBe OK
    contentAsString(result) shouldBe "Read successful"
  }

  test("PermissionTier key with permission should access write endpoint") {
    val fixture = new Fixture()
    val request = FakeRequest("POST", "/write")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "api-key-with-perms")

    val result = fixture.testController.writeEndpoint.apply(request)
    status(result) shouldBe OK
    contentAsString(result) shouldBe "Write successful"
  }

  test("PermissionTier key without permission should be allowed read access") {
    val fixture = new Fixture()
    val request = FakeRequest("GET", "/read")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "api-key-no-perms")

    val result = fixture.testController.readEndpoint.apply(request)
    status(result) shouldBe OK
  }

  test("PermissionTier key without permission should be denied write access") {
    val fixture = new Fixture()
    val request = FakeRequest("POST", "/write")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "api-key-no-perms")

    val result = fixture.testController.writeEndpoint.apply(request)
    status(result) shouldBe FORBIDDEN
  }

  test("PermissionTier key with Internal tier should be allowed read access") {
    val fixture = new Fixture()
    val request = FakeRequest("GET", "/read")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "api-key-internal")

    val result = fixture.testController.readEndpoint.apply(request)
    status(result) shouldBe OK
  }

  test("PermissionTier key with Internal tier should be allowed write access") {
    val fixture = new Fixture()
    val request = FakeRequest("POST", "/write")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "api-key-internal")

    val result = fixture.testController.writeEndpoint.apply(request)
    status(result) shouldBe OK
  }
  test("Invalid key should be not authenticated for read access") {
    val fixture = new Fixture()
    val request = FakeRequest("GET", "/read")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "blah")

    val result = fixture.testController.readEndpoint.apply(request)
    status(result) shouldBe FORBIDDEN
  }

  test("Invalid key should be not authenticated for write access") {
    val fixture = new Fixture()
    val request = FakeRequest("POST", "/write")
      .withHeaders(ApiKeyAuthenticationProvider.apiKeyHeaderName -> "blah")

    val result = fixture.testController.writeEndpoint.apply(request)
    status(result) shouldBe FORBIDDEN
  }

}


