package controllers

import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, SimplePermission}
import com.gu.mediaservice.lib.config.{CommonConfig, ServiceHosts, Services}
import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.logging.LogMarker
import lib._
import lib.storage.ImageLoaderStore
import model.{Projector, Uploader}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.{Materializer, SystemMaterializer}
import org.apache.pekko.util.{ByteString, Timeout}
import org.mockito.ArgumentMatchers.{any, anyString}
import org.mockito.Mockito.when
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.crypto.CookieSigner
import play.api.libs.ws.WSRequest
import play.api.mvc.RequestHeader
import play.api.test.Helpers.{ACCEPTED, BAD_REQUEST, FORBIDDEN, POST, call, status, stubControllerComponents}
import play.api.test.FakeRequest
import play.api.inject.ApplicationLifecycle

import java.nio.file.Files
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._

class DerivativeUploadAuthTest extends AnyFunSuite with Matchers with MockitoSugar with BeforeAndAfterAll {
  private implicit val executionContext: ExecutionContext = ExecutionContext.global
  private implicit val actorSystem: ActorSystem = ActorSystem("DerivativeUploadAuthTest")
  private implicit val materializer: Materializer = SystemMaterializer(actorSystem).materializer
  private implicit val timeout: Timeout = Timeout(10.seconds)

  override protected def afterAll(): Unit = {
    Await.result(actorSystem.terminate(), 10.seconds)
    super.afterAll()
  }

  private def controllerFor(
    temporaryDirectory: java.nio.file.Path,
    canUpload: Boolean,
    store: ImageLoaderStore = mock[ImageLoaderStore]
  ): ImageLoaderController = {
    val controllerComponents = stubControllerComponents()

    val userProvider = new UserAuthenticationProvider {
      override def authenticateRequest(request: RequestHeader): AuthenticationStatus =
        Authenticated(UserPrincipal("Test", "User", "test@example.com"))
      override def sendForAuthentication: Option[RequestHeader => Future[play.api.mvc.Result]] = None
      override def sendForAuthenticationCallback: Option[(RequestHeader, Option[AuthenticationProvider.RedirectUri]) => Future[play.api.mvc.Result]] = None
      override def flushToken: Option[(RequestHeader, play.api.mvc.Result) => play.api.mvc.Result] = None
      override def onBehalfOf(principal: Principal): Either[String, WSRequest => WSRequest] = Left("Not authenticated")
    }

    val machineProvider = new MachineAuthenticationProvider {
      override def authenticateRequest(request: RequestHeader): ApiAuthenticationStatus = NotAuthenticated
      override def onBehalfOf(principal: Principal): Either[String, WSRequest => WSRequest] = Left("Not authenticated")
    }
    val commonConfig = mock[CommonConfig]
    when(commonConfig.services).thenReturn(new Services("example.test", ServiceHosts.guardianPrefixes, Set.empty))
    val auth = new Authentication(
      commonConfig,
      AuthenticationProviders(userProvider, machineProvider, new InnerServiceAuthenticationProvider(mock[CookieSigner], "test")),
      controllerComponents.parsers.default,
      executionContext
    )
    val authorisationProvider = new AuthorisationProvider {
      override def hasPermissionTo(permission: SimplePermission, principal: Principal): Boolean = canUpload
      override def hasBasicAccess(userEmail: String): Boolean = false
    }
    val authorisation = new Authorisation(authorisationProvider, executionContext)
    val config = mock[ImageLoaderConfig]
    when(config.tempDir).thenReturn(temporaryDirectory.toFile)

    new ImageLoaderController(
      auth,
      mock[Downloader],
      store,
      None,
      mock[UploadStatusTable],
      mock[Notifications],
      config,
      mock[Uploader],
      None,
      mock[Projector],
      controllerComponents,
      mock[GridClient],
      authorisation,
      mock[ImageLoaderMetrics],
      mock[ApplicationLifecycle]
    )(executionContext, materializer)
  }

  private def withTemporaryDirectory(test: java.nio.file.Path => Unit): Unit = {
    val temporaryDirectory = Files.createTempDirectory("derivative-upload-auth-test")
    try {
      test(temporaryDirectory)
    } finally {
      val files = Files.list(temporaryDirectory)
      try files.forEach(path => Files.deleteIfExists(path))
      finally files.close()
      Files.deleteIfExists(temporaryDirectory)
    }
  }

  test("does not create a tempfile when the user lacks upload permission") {
    withTemporaryDirectory { temporaryDirectory =>
      val request = FakeRequest(POST, "/enqueueDerivativeImage")
        .withBody(ByteString.empty)
        .withHeaders("Content-Length" -> "0")
      val result = call(
        controllerFor(temporaryDirectory, canUpload = false)
          .enqueueDerivativeImage("derivative-id", "derivative.jpg", None, None, None),
        request
      )

      status(result) shouldBe FORBIDDEN
      val files = Files.list(temporaryDirectory)
      try files.count() shouldBe 0L
      finally files.close()
    }
  }

  test("deletes the tempfile when request body validation fails") {
    withTemporaryDirectory { temporaryDirectory =>
      val request = FakeRequest(POST, "/enqueueDerivativeImage")
        .withBody(ByteString("x"))
        .withHeaders("Content-Length" -> "2")
      val result = call(
        controllerFor(temporaryDirectory, canUpload = true)
          .enqueueDerivativeImage("derivative-id", "derivative.jpg", None, None, None),
        request
      )

      status(result) shouldBe BAD_REQUEST
      val files = Files.list(temporaryDirectory)
      try files.count() shouldBe 0L
      finally files.close()
    }
  }

  test("deletes the tempfile after enqueueing a derivative image") {
    withTemporaryDirectory { temporaryDirectory =>
      val store = mock[ImageLoaderStore]
      when(store.queueS3Object(
        anyString(),
        anyString(),
        any[Map[String, String]],
        any[java.io.File]
      )(any[LogMarker])).thenReturn(Future.successful(mock[S3Object]))

      val request = FakeRequest(POST, "/enqueueDerivativeImage")
        .withBody(ByteString.empty)
        .withHeaders("Content-Length" -> "0")
      val result = call(
        controllerFor(temporaryDirectory, canUpload = true, store = store)
          .enqueueDerivativeImage("derivative-id", "derivative.jpg", None, None, None),
        request
      )

      status(result) shouldBe ACCEPTED
      val files = Files.list(temporaryDirectory)
      try files.count() shouldBe 0L
      finally files.close()
    }
  }
}
