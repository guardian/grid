package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserMode}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.Materializer
import org.scalatest.BeforeAndAfterAll
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.mvc.{RequestHeader, Result, Results}
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest

import scala.concurrent.Future

class SentryTracingFilterTest extends AnyFunSuiteLike with Matchers with ScalaFutures with BeforeAndAfterAll {

  private implicit val system: ActorSystem = ActorSystem("SentryTracingFilterTest")
  private implicit val mat: Materializer = Materializer(system)
  private implicit val ec: scala.concurrent.ExecutionContext = system.dispatcher

  override def afterAll(): Unit = {
    system.terminate()
    super.afterAll()
  }

  private def config(dsn: Option[String], tracesSampleRate: Double) = SentryConfig(
    dsn = dsn,
    environment = "TEST",
    tracesSampleRate = tracesSampleRate,
    replayOnErrorSampleRate = 0,
    consoleCaptureLevels = Seq("error"),
    userMode = SentryUserMode.Anonymous,
    userSalt = None
  )

  private val disabled = config(None, 0)
  private val tracing = config(Some("https://key@o0.ingest.us.sentry.io/1"), 1.0)

  private def routed(request: RequestHeader, pattern: String): RequestHeader =
    request.addAttr(Router.Attrs.HandlerDef, HandlerDef(
      classLoader = getClass.getClassLoader,
      routerPackage = "router",
      controller = "controllers.Test",
      method = "index",
      parameterTypes = Seq.empty,
      verb = "GET",
      path = pattern
    ))

  private def ok(request: RequestHeader): Future[Result] = Future.successful(Results.Ok("body"))

  test("passes the request straight through when tracing is switched off") {
    val filter = new SentryTracingFilter(disabled, mat)
    var seen: Option[RequestHeader] = None

    val result = filter.apply { rh => seen = Some(rh); ok(rh) }(routed(FakeRequest(), "/images/:id"))

    whenReady(result)(_.header.status shouldBe 200)
    seen.flatMap(SentryTracingFilter.transactionFor) shouldBe None
  }

  test("attaches the transaction to the request rather than to Sentry's thread-local scope") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[RequestHeader] = None

    val result = filter.apply { rh => seen = Some(rh); ok(rh) }(routed(FakeRequest(), "/images/:id"))

    whenReady(result)(_.header.status shouldBe 200)
    seen.flatMap(SentryTracingFilter.transactionFor) should not be empty
  }

  test("does not trace health checks") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[RequestHeader] = None

    val request = routed(FakeRequest("GET", "/management/healthcheck"), "/management/healthcheck")
    whenReady(filter.apply { rh => seen = Some(rh); ok(rh) }(request))(_.header.status shouldBe 200)

    seen.flatMap(SentryTracingFilter.transactionFor) shouldBe None
  }

  test("does not trace unrouted requests, whose paths would carry ids into transaction names") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[RequestHeader] = None

    whenReady(filter.apply { rh => seen = Some(rh); ok(rh) }(FakeRequest("GET", "/images/abc123")))(
      _.header.status shouldBe 200
    )

    seen.flatMap(SentryTracingFilter.transactionFor) shouldBe None
  }

  test("still serves the request when the downstream action fails, and propagates the failure unchanged") {
    val filter = new SentryTracingFilter(tracing, mat)
    val boom = new RuntimeException("boom")

    val result = filter.apply(_ => Future.failed(boom))(routed(FakeRequest(), "/images/:id"))

    whenReady(result.failed)(_ shouldBe boom)
  }

  test("preserves the downstream status code") {
    val filter = new SentryTracingFilter(tracing, mat)

    val result = filter.apply(_ => Future.successful(Results.NotFound))(routed(FakeRequest(), "/images/:id"))

    whenReady(result)(_.header.status shouldBe 404)
  }
}
