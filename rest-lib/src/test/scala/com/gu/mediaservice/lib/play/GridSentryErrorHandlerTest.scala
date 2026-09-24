package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserMode}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest
import play.api.{Configuration, Environment, Mode}

class GridSentryErrorHandlerTest extends AnyFunSuiteLike with Matchers with ScalaFutures {

  private def config(dsn: Option[String]) = SentryConfig(
    dsn = dsn,
    environment = "TEST",
    tracesSampleRate = 0,
    replayOnErrorSampleRate = 0,
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
  }

  test("returns the same response when Sentry is enabled, so reporting cannot change behaviour") {
    whenReady(handler(enabled).onServerError(FakeRequest(), boom))(_.header.status shouldBe 500)
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

  test("reports a failing exception without rethrowing, so the original error still reaches Play") {
    val nested = new RuntimeException("outer", new IllegalStateException("cause"))
    whenReady(handler(enabled).onServerError(FakeRequest(), nested))(_.header.status shouldBe 500)
  }

  test("leaves client errors to Play, rather than reporting every 4xx as an exception") {
    whenReady(handler(enabled).onClientError(FakeRequest(), 404, "not found"))(_.header.status shouldBe 404)
  }
}
