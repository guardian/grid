package controllers

import com.gu.contentapi.client.model.v1.{CapiDateTime, Content, ContentFields, ItemResponse}
import com.gu.mediaservice.lib.auth.Authentication.UserPrincipal
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.usage.{PrintUsageMetadata, PublishedUsageStatus}
import lib._
import model._
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.{any, eq => eqTo}
import org.mockito.Mockito.when
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsValue, Json}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.mvc.{Action, Request, Result}
import play.api.test.FakeRequest
import play.api.test.Helpers._

import java.util.concurrent.{CountDownLatch, TimeUnit}
import scala.collection.mutable.ListBuffer
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.Try

class UsageApiTest extends AnyFunSuite with Matchers with MockitoSugar {
  private implicit val ec: ExecutionContext = ExecutionContext.parasitic
  private val modified = DateTime.parse("2026-11-01T12:00:00Z")

  private class Fixture {
    val ops = mock[UsageGroupOps]
    val capi = mock[LiveContentApi]
    val config = mock[UsageConfig]
    val components = stubControllerComponents()
    val groups = ListBuffer.empty[WithLogMarker[UsageGroup]]
    var onDelivery: () => Unit = () => ()
    private val recorder: UsageGroupRecorder = group => Future.fromTry(Try {
      onDelivery()
      groups += group
    })
    private val userProvider = mock[UserAuthenticationProvider]
    private val innerProvider = mock[InnerServiceAuthenticationProvider]
    when(userProvider.loginLink).thenReturn(DisableLoginLink)
    when(innerProvider.authenticateRequest(any[play.api.mvc.RequestHeader])).thenReturn(NotAuthenticated)
    private val auth = new Authentication(
      mock[CommonConfig],
      AuthenticationProviders(userProvider, mock[MachineAuthenticationProvider], innerProvider),
      components.parsers.default,
      ec
    ) {
      override def invokeBlock[A](request: Request[A], block: Authentication.Request[A] => Future[Result]): Future[Result] =
        block(new AuthenticatedRequest(UserPrincipal("Test", "User", "user@example.com"), request))
    }
    when(config.usageUri).thenReturn("https://usage.example.com")
    when(config.maxPrintRequestLengthInKb).thenReturn(64)
    val controller = new UsageApi(
      auth, new Authorisation(mock[AuthorisationProvider], ec), mock[UsageTable], ops,
      mock[Notifications], config, recorder, capi, components, components.parsers
    )

    def post(action: Action[JsValue], body: JsValue): Result =
      Await.result(action.apply(FakeRequest("POST", "/usages").withBody(body)), 5.seconds)

    def close(): Unit = ()
  }

  test("usage endpoints publish the parsed group and preserve its log context before returning accepted") {
    val f = new Fixture
    val group = UsageGroup(Set.empty, "request-group", modified)
    val syndication = SyndicationUsageRequest("partner", Some("user"), None, "image-id", modified)
    val front = FrontUsageRequest(modified, "user", "uk", "image-id")
    val download = DownloadUsageRequest(modified, "user", "image-id")
    val child = ChildUsageRequest(modified, "user", "image-id", "child-id", isReplacement = false)
    when(f.ops.build(Json.toJson(syndication).as[SyndicationUsageRequest])).thenReturn(group)
    when(f.ops.build(Json.toJson(front).as[FrontUsageRequest])).thenReturn(group)
    when(f.ops.build(Json.toJson(download).as[DownloadUsageRequest])).thenReturn(group)
    when(f.ops.build(Json.toJson(child).as[ChildUsageRequest])).thenReturn(group)
    val requests = List(
      f.controller.setSyndicationUsages() -> Json.obj("data" -> Json.toJson(syndication)),
      f.controller.setFrontUsages() -> Json.obj("data" -> Json.toJson(front)),
      f.controller.setDownloadUsages() -> Json.obj("data" -> Json.toJson(download)),
      f.controller.setChildUsages() -> Json.obj("data" -> Json.toJson(child))
    )

    try requests.foreach { case (action, body) =>
      f.groups.clear()
      f.post(action, body).header.status shouldBe ACCEPTED
      f.groups.map(_.value).toList shouldBe List(group)
      f.groups.head.logMarker.markerContents should contain("usageGroup" -> group.grouping)
      f.groups.head.logMarker.markerContents should contain("image-id" -> "image-id")
    } finally f.close()
  }

  test("a print batch publishes every group in request order") {
    val f = new Fixture
    val metadata = PrintUsageMetadata("news", modified, 1, "story", "G", "Guardian", edition = None, sectionCode = "news")
    val records = List("first", "second").map(id =>
      PrintUsageRecord(modified, id, metadata, "container", id, PublishedUsageStatus))
    val groups = records.map(record => UsageGroup(Set.empty, record.mediaId, modified))
    val body = Json.toJson(PrintUsageRequest(records))
    when(f.ops.build(body.as[PrintUsageRequest].printUsageRecords)).thenReturn(groups)

    try {
      f.post(f.controller.setPrintUsages, body).header.status shouldBe ACCEPTED
      f.groups.map(_.value).toList shouldBe groups
    } finally f.close()
  }

  test("accepted is not returned while a usage group is still being delivered") {
    val f = new Fixture
    val request = FrontUsageRequest(modified, "user", "uk", "image-id")
    val body = Json.obj("data" -> Json.toJson(request))
    val group = UsageGroup(Set.empty, "pending-group", modified)
    when(f.ops.build(Json.toJson(request).as[FrontUsageRequest])).thenReturn(group)
    val entered = new CountDownLatch(1)
    val release = new CountDownLatch(1)
    f.onDelivery = () => {
      entered.countDown()
      require(release.await(5, TimeUnit.SECONDS), "delivery was not released")
    }
    val response = Future(f.post(f.controller.setFrontUsages(), body))(ExecutionContext.global)

    try {
      entered.await(5, TimeUnit.SECONDS) shouldBe true
      response.isCompleted shouldBe false
    } finally {
      release.countDown()
      try Await.result(response, 5.seconds).header.status shouldBe ACCEPTED
      finally f.close()
    }
  }

  test("invalid usage requests return bad request without publishing") {
    val f = new Fixture
    try {
      List(f.controller.setPrintUsages, f.controller.setSyndicationUsages(), f.controller.setFrontUsages(),
        f.controller.setDownloadUsages(), f.controller.setChildUsages()).foreach { action =>
        f.post(action, Json.obj()).header.status shouldBe BAD_REQUEST
      }
      f.groups shouldBe empty
    } finally f.close()
  }

  test("a failed delivery returns a server error without accepting the usage group") {
    val f = new Fixture
    val request = FrontUsageRequest(modified, "user", "uk", "image-id")
    when(f.ops.build(Json.toJson(request).as[FrontUsageRequest]))
      .thenReturn(UsageGroup(Set.empty, "failed-delivery", modified))
    f.onDelivery = () => throw new IllegalStateException("delivery failed")

    try {
      val response = Future(f.post(f.controller.setFrontUsages(), Json.obj("data" -> Json.toJson(request))))(ExecutionContext.global)
      Await.result(response, 5.seconds).header.status shouldBe INTERNAL_SERVER_ERROR
      f.groups shouldBe empty
    } finally f.close()
  }

  test("reindex publishes a published group with the reindex flag before returning accepted") {
    val f = new Fixture
    val content = Content.unsafeEmpty.copy(id = "content-id", fields = Some(ContentFields.unsafeEmpty.copy(
      firstPublicationDate = Some(CapiDateTime(modified.getMillis, modified.toString))
    )))
    val group = UsageGroup(Set.empty, content.id, modified, isReindex = true, maybeStatus = Some(PublishedUsageStatus))
    when(f.capi.getResponse(f.capi.usageQuery(content.id)))
      .thenReturn(Future.successful(ItemResponse.unsafeEmpty.copy(content = Some(content))))
    when(f.ops.build(eqTo(content), eqTo(PublishedUsageStatus), any[DateTime], eqTo(true))(any[LogMarker]))
      .thenReturn(Some(group))

    try {
      Await.result(f.controller.reindexForContent(content.id).apply(FakeRequest()), 5.seconds).header.status shouldBe ACCEPTED
      f.groups.map(_.value).toList shouldBe List(group)
    } finally f.close()
  }
}
