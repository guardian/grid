package controllers

import com.gu.mediaservice.lib.auth.Authentication.{OnBehalfOfPrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.config.{CommonConfig, ServiceHosts, Services}
import lib.{EditsConfig, EditsStore, Notifications}
import org.apache.pekko.actor.ActorSystem
import org.mockito.ArgumentMatchers.{any, anyString}
import org.mockito.Mockito.{never, verify, when}
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.{WSClient, WSRequest, WSResponse}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc.{PlayBodyParsers, Request, Result}
import play.api.test.Helpers._
import play.api.test.{FakeRequest, Helpers}

import scala.concurrent.{ExecutionContext, Future}

class EditsControllerUsageRightsAuthTest extends AnyFunSpec with Matchers with MockitoSugar with BeforeAndAfterAll {
  implicit val actorSystem: ActorSystem = ActorSystem("edits-controller-test")
  implicit val ec: ExecutionContext = ExecutionContext.global

  override protected def afterAll(): Unit = actorSystem.terminate()

  private val imageId = "abc123"
  private val user = UserPrincipal("Test", "User", "test.user@example.com")
  private val validBody = Json.obj("data" -> Json.obj("category" -> "agency", "supplier" -> "Getty Images"))

  private class Fixture(hasEditMetadata: Boolean, uploadedBy: Option[String]) {
    val store: EditsStore = mock[EditsStore]
    val notifications: Notifications = mock[Notifications]
    val config: EditsConfig = mock[EditsConfig]
    val ws: WSClient = mock[WSClient]

    private val services = new Services("example.com", ServiceHosts.guardianPrefixes, Set.empty)
    when(config.domainRoot).thenReturn("example.com")
    when(config.serviceHosts).thenReturn(ServiceHosts.guardianPrefixes)
    when(config.services).thenReturn(services)

    private val request = mock[WSRequest]
    private val response = mock[WSResponse]
    when(ws.url(anyString())).thenReturn(request)
    when(request.withQueryStringParameters(any[(String, String)]())).thenReturn(request)
    when(request.withMethod("GET")).thenReturn(request)
    when(request.get()).thenReturn(Future.successful(response))
    uploadedBy match {
      case Some(email) =>
        when(response.status).thenReturn(200)
        when(response.body).thenReturn(Json.obj("data" -> email).toString)
      case None =>
        when(response.status).thenReturn(404)
        when(response.body).thenReturn("")
    }

    private val authProvider = mock[AuthorisationProvider]
    when(authProvider.hasPermissionTo(any(), any[Principal]())).thenReturn(hasEditMetadata)

    private val userProvider = mock[UserAuthenticationProvider]
    when(userProvider.loginLink).thenReturn(DisableLoginLink)
    private val providers = AuthenticationProviders(userProvider, mock[MachineAuthenticationProvider], mock[InnerServiceAuthenticationProvider])

    private val auth = new Authentication(mock[CommonConfig], providers, PlayBodyParsers().default, ec) {
      override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] =
        block(new AuthenticatedRequest(user, request))
      override def getOnBehalfOfPrincipal(principal: Principal): OnBehalfOfPrincipal = identity
    }

    val controller = new EditsController(
      auth, store, notifications, config, ws,
      new Authorisation(authProvider, ec),
      Helpers.stubControllerComponents()
    )
  }

  describe("PUT /metadata/:id/usage-rights") {
    it("is forbidden for a user without EditMetadata who is not the uploader") {
      val f = new Fixture(hasEditMetadata = false, uploadedBy = Some("someone.else@example.com"))
      val result = f.controller.setUsageRights(imageId)(FakeRequest().withBody(validBody))
      status(result) shouldBe FORBIDDEN
      verify(f.store, never()).jsonAdd(anyString(), anyString(), any())(any())
    }

    it("is forbidden when the uploader cannot be determined") {
      val f = new Fixture(hasEditMetadata = false, uploadedBy = None)
      val result = f.controller.setUsageRights(imageId)(FakeRequest().withBody(validBody))
      status(result) shouldBe FORBIDDEN
      verify(f.store, never()).jsonAdd(anyString(), anyString(), any())(any())
    }

    it("is allowed for a user with EditMetadata") {
      val f = new Fixture(hasEditMetadata = true, uploadedBy = None)
      when(f.store.jsonAdd(anyString(), anyString(), any())(any())).thenReturn(Future.successful(JsObject.empty))
      val result = f.controller.setUsageRights(imageId)(FakeRequest().withBody(validBody))
      status(result) should not be FORBIDDEN
      verify(f.store).jsonAdd(anyString(), anyString(), any())(any())
    }

    it("is allowed for the uploader without EditMetadata") {
      val f = new Fixture(hasEditMetadata = false, uploadedBy = Some(user.email))
      when(f.store.jsonAdd(anyString(), anyString(), any())(any())).thenReturn(Future.successful(JsObject.empty))
      val result = f.controller.setUsageRights(imageId)(FakeRequest().withBody(validBody))
      status(result) should not be FORBIDDEN
      verify(f.store).jsonAdd(anyString(), anyString(), any())(any())
    }
  }

  describe("DELETE /metadata/:id/usage-rights") {
    it("is forbidden for a user without EditMetadata who is not the uploader") {
      val f = new Fixture(hasEditMetadata = false, uploadedBy = Some("someone.else@example.com"))
      val result = f.controller.deleteUsageRights(imageId)(FakeRequest())
      status(result) shouldBe FORBIDDEN
      verify(f.store, never()).removeKey(anyString(), anyString())(any())
    }

    it("is allowed for a user with EditMetadata") {
      val f = new Fixture(hasEditMetadata = true, uploadedBy = None)
      when(f.store.removeKey(anyString(), anyString())(any())).thenReturn(Future.successful(JsObject.empty))
      val result = f.controller.deleteUsageRights(imageId)(FakeRequest())
      status(result) should not be FORBIDDEN
      verify(f.store).removeKey(anyString(), anyString())(any())
    }

    it("is allowed for the uploader without EditMetadata") {
      val f = new Fixture(hasEditMetadata = false, uploadedBy = Some(user.email))
      when(f.store.removeKey(anyString(), anyString())(any())).thenReturn(Future.successful(JsObject.empty))
      val result = f.controller.deleteUsageRights(imageId)(FakeRequest())
      status(result) should not be FORBIDDEN
      verify(f.store).removeKey(anyString(), anyString())(any())
    }
  }

  describe("DELETE /metadata/:id/archived") {
    it("is forbidden for a user without ArchiveImages") {
      val f = new Fixture(hasEditMetadata = false, uploadedBy = None)
      val result = f.controller.unsetArchived(imageId)(FakeRequest())
      status(result) shouldBe FORBIDDEN
      verify(f.store, never()).removeKey(anyString(), anyString())(any())
    }

    it("is allowed for a user with ArchiveImages") {
      val f = new Fixture(hasEditMetadata = true, uploadedBy = None)
      when(f.store.removeKey(anyString(), anyString())(any())).thenReturn(Future.successful(JsObject.empty))
      val result = f.controller.unsetArchived(imageId)(FakeRequest())
      status(result) should not be FORBIDDEN
      verify(f.store).removeKey(anyString(), anyString())(any())
    }
  }
}
