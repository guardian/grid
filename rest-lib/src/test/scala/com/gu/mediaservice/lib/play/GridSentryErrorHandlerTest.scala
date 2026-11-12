package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserMode}
import io.sentry.{Sentry, SentryEvent}
import io.sentry.transport.NoOpTransport
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.mvc.WrappedRequest
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest
import play.api.{Configuration, Environment, Mode}

class GridSentryErrorHandlerTest extends AnyFunSuiteLike with Matchers with ScalaFutures with BeforeAndAfterEach {

  @volatile private var captured: Option[SentryEvent] = None

  override def beforeEach(): Unit = {
    super.beforeEach()
    captured = None
    Sentry.init { options =>
      options.setDsn("https://key@sentry.example.com/1")
      options.setTransportFactory((_, _) => NoOpTransport.getInstance())
      options.setBeforeSend { (event, _) =>
        captured = Some(event)
        event
      }
    }
  }

  override def afterEach(): Unit =
    try Sentry.close()
    finally super.afterEach()

  private def config(dsn: Option[String]) = SentryConfig(
    dsn = dsn,
    environment = "TEST",
    consoleCaptureLevels = Seq("error"),
    userMode = SentryUserMode.Anonymous,
    userSalt = None
  )

  private def handler(sentryConfig: SentryConfig) = new GridSentryErrorHandler(
    environment = Environment.simple(mode = Mode.Prod),
    configuration = Configuration.empty,
    sourceMapper = None,
    router = None,
    sentryConfig = sentryConfig
  )

  private val enabled = config(Some("https://key@o0.ingest.us.sentry.io/1"))
  private val disabled = config(None)

  private val boom = new RuntimeException("boom")

  test("returns Play's normal server error response when Sentry is disabled") {
    whenReady(handler(disabled).onServerError(FakeRequest(), boom))(_.header.status shouldBe 500)
    captured shouldBe None
  }

  test("returns the same response when Sentry is enabled, so reporting cannot change behaviour") {
    whenReady(handler(enabled).onServerError(FakeRequest(), boom))(_.header.status shouldBe 500)
    captured.map(_.getThrowable) shouldBe Some(boom)
  }

  test("still responds when the request carries no route, rather than failing while enriching") {
    val request = FakeRequest("GET", "/some/unrouted/path")
    whenReady(handler(enabled).onServerError(request, boom))(_.header.status shouldBe 500)
  }

  test("still responds for a routed request") {
    val request = FakeRequest("GET", "/images/abc123").addAttr(Router.Attrs.HandlerDef, HandlerDef(
      classLoader = getClass.getClassLoader,
      routerPackage = "router",
      controller = "controllers.Test",
      method = "index",
      parameterTypes = Seq.empty,
      verb = "GET",
      path = "/images/:id"
    ))

    whenReady(handler(enabled).onServerError(request, boom))(_.header.status shouldBe 500)
  }

  test("reports nested application exceptions and preserves the server error response") {
    val nested = new RuntimeException("outer", new IllegalStateException("cause"))
    whenReady(handler(enabled).onServerError(FakeRequest(), nested))(_.header.status shouldBe 500)
    captured.map(_.getThrowable) shouldBe Some(nested)
  }

  test("preserves Play's response when request metadata enrichment throws") {
    var enrichmentAttempted = false
    val request = new WrappedRequest(FakeRequest()) {
      override lazy val host: String = {
        enrichmentAttempted = true
        throw new IllegalStateException("Cannot read request host")
      }
    }

    whenReady(handler(disabled).onServerError(FakeRequest(), boom)) { expected =>
      whenReady(handler(enabled).onServerError(request, boom)) { actual =>
        actual.header shouldBe expected.header
        actual.body.contentType shouldBe expected.body.contentType
      }
    }
    enrichmentAttempted shouldBe true
    captured shouldBe None
  }

  test("initialiser configures service, stage and release on captured errors") {
    Sentry.close()
    SentryInitialiser.init(enabled, appName = "media-api", release = "test-commit")
    val options = Sentry.getCurrentScopes.getOptions
    // Drop the event before transport so this test never sends it to Sentry.
    options.setBeforeSend { (event, _) =>
      captured = Some(event)
      null
    }

    Sentry.isEnabled shouldBe true
    options.isAttachStacktrace shouldBe true
    options.isSendDefaultPii shouldBe false
    whenReady(handler(enabled).onServerError(FakeRequest(), boom))(_.header.status shouldBe 500)

    val event = captured.getOrElse(fail("No Sentry event was captured"))
    event.getServerName shouldBe "media-api"
    event.getTag("app") shouldBe "media-api"
    event.getTag("stage") shouldBe "TEST"
    event.getEnvironment shouldBe "TEST"
    event.getRelease shouldBe "test-commit"
  }

  test("leaves client errors to Play, rather than reporting every 4xx as an exception") {
    whenReady(handler(enabled).onClientError(FakeRequest(), 404, "not found"))(_.header.status shouldBe 404)
    captured shouldBe None
  }

  test("captures route and request ID without credentials, query strings or bodies") {
    val request = FakeRequest("POST", "/images/private-id?token=secret")
      .withHeaders("Host" -> "grid.example.com", "Authorization" -> "secret", "Cookie" -> "session=secret", "User-Agent" -> "test-agent")
      .withBody("private metadata")
      .addAttr(RequestLoggingFilter.requestUuidKey, "request-123")
      .addAttr(Router.Attrs.HandlerDef, HandlerDef(
        classLoader = getClass.getClassLoader,
        routerPackage = "router",
        controller = "controllers.Test",
        method = "update",
        parameterTypes = Seq.empty,
        verb = "POST",
        path = "/images/:id"
      ))

    whenReady(handler(enabled).onServerError(request, boom))(_.header.status shouldBe 500)
    val event = captured.getOrElse(fail("No Sentry event was captured"))
    event.getTag("request_id") shouldBe "request-123"
    event.getRequest.getMethod shouldBe "POST"
    event.getRequest.getUrl shouldBe "grid.example.com/images/:id"
    event.getRequest.getHeaders.size() shouldBe 1
    event.getRequest.getHeaders.get("User-Agent") shouldBe "test-agent"
    event.getRequest.getCookies shouldBe null
    event.getRequest.getQueryString shouldBe null
    event.getRequest.getData shouldBe null
  }
}
