package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.SentryConfig
import io.sentry.{Sentry, SentryEvent}
import io.sentry.transport.NoOpTransport
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.mvc.{RequestHeader, WrappedRequest}
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest
import play.api.{Configuration, Environment, Mode, UnexpectedException}

class GridSentryErrorHandlerTest extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterEach {

  @volatile private var captured: Option[SentryEvent] = None

  override def beforeEach(): Unit = {
    super.beforeEach()
    captured = None
    Sentry.init { options =>
      options.setDsn("https://key@sentry.example.com/1")
      options.setTracesSampleRate(1d)
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

  private val enabledConfig = SentryConfig(
    dsn = Some("https://key@o0.ingest.us.sentry.io/1"),
    environment = "TEST",
    tracesSampleRate = 0,
    replayOnErrorSampleRate = 0,
    consoleCaptureLevels = Seq("error")
  )

  private val disabledConfig = SentryConfig(
    dsn = None,
    environment = "TEST",
    tracesSampleRate = 0,
    replayOnErrorSampleRate = 0,
    consoleCaptureLevels = Seq("error")
  )

  private def handler(sentryConfig: SentryConfig) = new GridSentryErrorHandler(
    environment = Environment.simple(mode = Mode.Prod),
    configuration = Configuration.empty,
    sourceMapper = None,
    router = None,
    sentryConfig = sentryConfig
  )

  private val boom = new RuntimeException("boom")

  private def assertPlayResponseAndCapture(request: RequestHeader): Unit = {
    // Play includes the UsefulException's generated ID in its production error page.
    val error = UnexpectedException(unexpected = Some(boom))
    whenReady(handler(disabledConfig).onServerError(request, error)) { expected =>
      captured shouldBe None
      whenReady(handler(enabledConfig).onServerError(request, error)) { actual =>
        actual.header shouldBe expected.header
        actual.header.status shouldBe 500
        actual.body shouldBe expected.body
      }
    }
    captured.map(_.getThrowable) shouldBe Some(error)
  }

  describe("Play's normal server error response") {
    it("is returned while capturing an exception for an unrouted request") {
      assertPlayResponseAndCapture(FakeRequest("GET", "/some/unrouted/path"))
    }

    it("is returned while capturing an exception for a routed request") {
      val request = FakeRequest("GET", "/images/abc123").addAttr(Router.Attrs.HandlerDef, HandlerDef(
        classLoader = getClass.getClassLoader,
        routerPackage = "router",
        controller = "controllers.Test",
        method = "index",
        parameterTypes = Seq.empty,
        verb = "GET",
        path = "/images/:id"
      ))

      assertPlayResponseAndCapture(request)
    }

    it("is returned while capturing a nested exception") {
      val nested = new RuntimeException("outer", new IllegalStateException("cause"))
      whenReady(handler(enabledConfig).onServerError(FakeRequest(), nested))(_.header.status shouldBe 500)
      captured.map(_.getThrowable) shouldBe Some(nested)
    }

    it("is returned even when request metadata enrichment throws") {
      var enrichmentAttempted = false
      val error = UnexpectedException(unexpected = Some(boom))
      val request = new WrappedRequest(FakeRequest()) {
        override lazy val host: String = {
          enrichmentAttempted = true
          throw new IllegalStateException("Cannot read request host")
        }
      }

      whenReady(handler(disabledConfig).onServerError(FakeRequest(), error)) { expected =>
        whenReady(handler(enabledConfig).onServerError(request, error)) { actual =>
          actual.header shouldBe expected.header
          actual.body shouldBe expected.body
        }
      }
      enrichmentAttempted shouldBe true
      captured shouldBe None
    }
  }

  it("initialiser configures service, stage and release on captured errors") {
    Sentry.close()
    SentryInitialiser.init(enabledConfig, appName = "media-api", release = "test-commit")
    val options = Sentry.getCurrentScopes.getOptions
    // Drop the event before transport so this test never sends it to Sentry.
    options.setBeforeSend { (event, _) =>
      captured = Some(event)
      null
    }

    Sentry.isEnabled shouldBe true
    options.isAttachStacktrace shouldBe true
    options.isSendDefaultPii shouldBe false
    whenReady(handler(enabledConfig).onServerError(FakeRequest(), boom))(_.header.status shouldBe 500)

    val event = captured.getOrElse(fail("No Sentry event was captured"))
    event.getServerName shouldBe "media-api"
    event.getTag("app") shouldBe "media-api"
    event.getTag("stage") shouldBe "TEST"
    event.getEnvironment shouldBe "TEST"
    event.getRelease shouldBe "test-commit"
  }

  it("leaves client errors to Play, rather than reporting every 4xx as an exception") {
    whenReady(handler(enabledConfig).onClientError(FakeRequest(), 404, "not found"))(_.header.status shouldBe 404)
    captured shouldBe None
  }

  it("captures route and request ID without credentials, query strings or bodies") {
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

    whenReady(handler(enabledConfig).onServerError(request, boom))(_.header.status shouldBe 500)
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
