package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserMode}
import io.sentry.{ITransaction, Sentry, SpanStatus}
import io.sentry.transport.NoOpTransport
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.Materializer
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.mvc.{RequestHeader, Result, Results}
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest

import scala.concurrent.{Future, Promise}

class SentryTracingFilterTest extends AnyFunSuiteLike with Matchers with ScalaFutures with BeforeAndAfterAll with BeforeAndAfterEach {

  private implicit val system: ActorSystem = ActorSystem("SentryTracingFilterTest")
  private implicit val mat: Materializer = Materializer(system)
  private implicit val ec: scala.concurrent.ExecutionContext = system.dispatcher

  override def beforeEach(): Unit = {
    super.beforeEach()
    Sentry.init { options =>
      options.setDsn("https://key@sentry.example.com/1")
      options.setTracesSampleRate(1d)
      options.setTransportFactory((_, _) => NoOpTransport.getInstance())
    }
  }

  override def afterEach(): Unit =
    try Sentry.close()
    finally super.afterEach()

  override def afterAll(): Unit = {
    system.terminate()
    super.afterAll()
  }

  private def config(dsn: Option[String], tracesSampleRate: Double) = SentryConfig(
    dsn = dsn,
    environment = "TEST",
    tracesSampleRate = tracesSampleRate,
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

  test("continues an incoming trace, names it by route and finishes it with the response status") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[ITransaction] = None
    val traceId = "0123456789abcdef0123456789abcdef"
    val request = routed(
      FakeRequest("GET", "/images/private-id")
        .withHeaders("sentry-trace" -> s"$traceId-0123456789abcdef-1")
        .addAttr(RequestLoggingFilter.requestUuidKey, "request-123"),
      "/images/:id"
    )

    val result = filter.apply { rh =>
      seen = SentryTracingFilter.transactionFor(rh)
      Future.successful(Results.NotFound)
    }(request)

    whenReady(result)(_.header.status shouldBe 404)
    val transaction = seen.getOrElse(fail("No transaction attached"))
    transaction.getSpanContext.getTraceId.toString shouldBe traceId
    transaction.getName shouldBe "GET /images/:id"
    transaction.getTag("request_id") shouldBe "request-123"
    transaction.isFinished shouldBe true
    transaction.getStatus shouldBe SpanStatus.NOT_FOUND
  }

  test("finishes a transaction when downstream fails without replacing the failure") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[ITransaction] = None
    val error = new IllegalStateException("test failure")
    val result = filter.apply { rh =>
      seen = SentryTracingFilter.transactionFor(rh)
      Future.failed(error)
    }(routed(FakeRequest(), "/images/:id"))

    whenReady(result.failed)(_ shouldBe error)
    val transaction = seen.getOrElse(fail("No transaction attached"))
    transaction.isFinished shouldBe true
    transaction.getStatus shouldBe SpanStatus.INTERNAL_ERROR
  }

  test("keeps overlapping asynchronous requests on separate transactions") {
    val filter = new SentryTracingFilter(tracing, mat)
    val firstResponse = Promise[Result]()
    var first: Option[ITransaction] = None
    var second: Option[ITransaction] = None

    val pending = filter.apply { rh =>
      first = SentryTracingFilter.transactionFor(rh)
      firstResponse.future
    }(routed(FakeRequest(), "/first"))
    val completed = filter.apply { rh =>
      second = SentryTracingFilter.transactionFor(rh)
      ok(rh)
    }(routed(FakeRequest(), "/second"))

    whenReady(completed)(_.header.status shouldBe 200)
    val firstTransaction = first.getOrElse(fail("No first transaction"))
    val secondTransaction = second.getOrElse(fail("No second transaction"))
    firstTransaction.getSpanContext.getTraceId should not be secondTransaction.getSpanContext.getTraceId
    firstTransaction.isFinished shouldBe false
    secondTransaction.isFinished shouldBe true
    firstResponse.success(Results.Ok)
    whenReady(pending)(_.header.status shouldBe 200)
    firstTransaction.isFinished shouldBe true
  }

  test("does not trace assets") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[ITransaction] = None
    val result = filter.apply { rh =>
      seen = SentryTracingFilter.transactionFor(rh)
      ok(rh)
    }(routed(FakeRequest("GET", "/assets/build.js"), "/assets/*file"))
    whenReady(result)(_.header.status shouldBe 200)
    seen shouldBe None
  }
}
