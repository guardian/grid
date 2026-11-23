package controllers

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions.DeleteImage
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.auth.{ApiAccessor, Authentication, Authorisation, SimplePermission}
import com.gu.mediaservice.lib.aws.{Embedder, S3, ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.config.{CommonConfig, ServiceHosts}
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.lib.metadata.SoftDeletedMetadataTable
import com.gu.mediaservice.model.{Image, ImageStatusRecord, NoRights}
import lib.{ImageResponse, MediaApiConfig, MediaApiMetrics, PreviewContentApi}
import lib.elasticsearch.{ElasticSearch, Fixtures}
import lib.querysyntax.Parser
import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{never, verify, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.ws.WSClient
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc.{ControllerComponents, Request, RequestHeader, Result}
import play.api.test.FakeRequest
import play.api.test.Helpers._

import scala.concurrent.{ExecutionContext, Future, Promise}

trait MediaApiTestSupport extends MockitoSugar {
  private implicit val controllerExecutionContext: ExecutionContext = ExecutionContext.global

  private case class ControllerDeps(config: MediaApiConfig, components: ControllerComponents, auth: Authentication, authorisation: Authorisation)

  private def controllerDeps(principal: Principal, privileged: Boolean): ControllerDeps = {
    val config = mock[MediaApiConfig]
    when(config.domainRoot).thenReturn("example.test")
    when(config.serviceHosts).thenReturn(ServiceHosts.guardianPrefixes)
    when(config.rootUri).thenReturn("https://media.example.test")
    when(config.aiSearchEmbeddingCacheMaxSize).thenReturn(10)

    val components = stubControllerComponents()
    val userProvider = mock[UserAuthenticationProvider]
    when(userProvider.loginLink).thenReturn(DisableLoginLink)
    when(userProvider.authenticateRequest(any[RequestHeader])).thenReturn(principal match {
      case user: UserPrincipal => Authenticated(user)
      case _ => NotAuthenticated
    })
    val apiProvider = mock[MachineAuthenticationProvider]
    when(apiProvider.authenticateRequest(any[RequestHeader])).thenAnswer { invocation =>
      principal match {
        case machine: MachinePrincipal =>
          val request = invocation.getArgument[RequestHeader](0)
          if (ApiAccessor.hasAccess(machine.accessor, request, config.services)) Authenticated(machine)
          else NotAuthorised("Method not allowed for this tier")
        case _ => NotAuthenticated
      }
    }
    val innerProvider = mock[InnerServiceAuthenticationProvider]
    when(innerProvider.authenticateRequest(any[RequestHeader])).thenReturn(NotAuthenticated)
    val auth = new Authentication(config, AuthenticationProviders(
      userProvider, apiProvider, innerProvider
    ), components.parsers.default, controllerExecutionContext)
    val permissionProvider = mock[AuthorisationProvider]
    when(permissionProvider.hasPermissionTo(DeleteImage, principal)).thenReturn(privileged)
    val authorisation = new Authorisation(permissionProvider, controllerExecutionContext)
    ControllerDeps(config, components, auth, authorisation)
  }

  protected def mediaApiFor(principal: Principal, search: ElasticSearch, imageResponse: ImageResponse, privileged: Boolean = false,
                            embedder: Embedder = null, configure: MediaApiConfig => Unit = _ => ()): MediaApi = {
    val deps = controllerDeps(principal, privileged)
    configure(deps.config)
    new MediaApi(deps.auth, null, null, search, imageResponse, deps.config, null, deps.components,
      null, null, null, deps.authorisation, embedder)
  }

  protected def imageQueryControllerFor(principal: Principal, search: ElasticSearch, imageResponse: ImageResponse, privileged: Boolean = false): ImageQueryController = {
    val deps = controllerDeps(principal, privileged)
    new ImageQueryController(deps.auth, search, imageResponse, deps.config, deps.authorisation, deps.components)
  }
}

class MediaApiTest extends AnyFunSpec with Matchers with MockitoSugar with ScalaFutures with Fixtures {
  private implicit val ec: ExecutionContext = ExecutionContext.parasitic
  private val image = createImage("image-id", NoRights)

  private class DeleteFixture {
    val sender: ThrallMessageSender = mock[ThrallMessageSender]
    val statusTable: SoftDeletedMetadataTable = mock[SoftDeletedMetadataTable]
    val persistence: Promise[Unit] = Promise[Unit]()
    private val es = mock[ElasticSearch]
    private val response = mock[ImageResponse]
    private val authorisation = mock[Authorisation]
    private val config = mock[MediaApiConfig]
    private val components = stubControllerComponents()
    private val user = UserPrincipal("Test", "User", "user@example.com")
    private val userProvider = mock[UserAuthenticationProvider]
    when(userProvider.loginLink).thenReturn(DisableLoginLink)
    private val auth = new Authentication(
      mock[CommonConfig],
      AuthenticationProviders(
        userProvider,
        mock[MachineAuthenticationProvider],
        mock[InnerServiceAuthenticationProvider]
      ),
      components.parsers.default,
      ec
    ) {
      override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] =
        block(new AuthenticatedRequest(user, request))
    }

    when(config.domainRoot).thenReturn("example.com")
    when(config.serviceHosts).thenReturn(ServiceHosts.guardianPrefixes)
    when(config.aiSearchEmbeddingCacheMaxSize).thenReturn(10)
    when(es.getImageById(any[String])(any[ExecutionContext], any[LogMarker]))
      .thenReturn(Future.successful(Some(image)))
    when(response.canBeDeleted(any[Image])).thenReturn(true)
    when(authorisation.isUploaderOrHasPermission(any[Principal], any[String], any[SimplePermission]))
      .thenReturn(true)
    when(statusTable.setStatus(any[ImageStatusRecord])(any[ExecutionContext])).thenReturn(persistence.future)

    val controller = new MediaApi(
      auth, sender, statusTable, es, response, config, mock[PreviewContentApi],
      components, mock[S3], mock[MediaApiMetrics], mock[WSClient], authorisation, mock[Embedder]
    )

    def delete(): Future[Result] =
      controller.deleteImage(image.id)(FakeRequest("DELETE", s"/images/${image.id}"))
  }

  describe("soft-delete completion") {
    it("waits for status persistence before publishing with a matching deleteTime") {
      val f = new DeleteFixture
      val recordCaptor = ArgumentCaptor.forClass(classOf[ImageStatusRecord])
      val messageCaptor = ArgumentCaptor.forClass(classOf[UpdateMessage])
      val result = f.delete()

      result.isCompleted shouldBe false
      verify(f.sender, never()).publish(any[UpdateMessage])
      f.persistence.success(())

      result.futureValue.header.status shouldBe ACCEPTED
      verify(f.statusTable).setStatus(recordCaptor.capture())(any[ExecutionContext])
      verify(f.sender).publish(messageCaptor.capture())
      messageCaptor.getValue.softDeletedMetadata.get.deleteTime.toString shouldBe recordCaptor.getValue.deleteTime
    }

    it("does not publish when status persistence fails") {
      val f = new DeleteFixture
      val failure = new RuntimeException("persistence failed")
      val result = f.delete()

      f.persistence.failure(failure)

      result.failed.futureValue shouldBe failure
      verify(f.sender, never()).publish(any[UpdateMessage])
    }
  }

  describe("MediaApi.deletedImageUploaderScope") {
    val identity = "user@example.test"

    it("scopes an explicit deleted search for users without global delete permission") {
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats is:deleted"),
        hasGlobalDeletePermission = false,
        identity = identity
      ) shouldBe Some(identity)
    }

    it("does not scope literal text or an explicit deleted exclusion") {
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats \"is:deleted\""),
        hasGlobalDeletePermission = false,
        identity = identity
      ) shouldBe None
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats -is:deleted"),
        hasGlobalDeletePermission = false,
        identity = identity
      ) shouldBe None
    }

    it("does not scope users with global delete permission") {
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats is:deleted"),
        hasGlobalDeletePermission = true,
        identity = identity
      ) shouldBe None
    }
  }

  describe("MediaApi.shouldSkipUsageRecording") {
    it("skips recording when the URI is a download and the user is the InDesign API key") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/download",
        user = MediaApi.InDesignIdentity
      ) shouldBe true
    }

    it("does not skip recording for a download from a real user") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/download",
        user = "some-real-user@guardian.co.uk"
      ) shouldBe false
    }

    it("does not skip recording for a syndication request, even from the InDesign API key") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/syndication",
        user = MediaApi.InDesignIdentity
      ) shouldBe false
    }

    it("does not skip recording for a syndication request from a real user") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/syndication",
        user = "some-real-user@guardian.co.uk"
      ) shouldBe false
    }
  }
}
