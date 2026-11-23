package controllers

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, SimplePermission}
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
import play.api.mvc.{Request, Result}
import play.api.test.FakeRequest
import play.api.test.Helpers._

import scala.concurrent.{ExecutionContext, Future, Promise}

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
