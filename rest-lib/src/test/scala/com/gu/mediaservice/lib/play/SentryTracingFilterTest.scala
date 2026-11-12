package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.{SentryConfig, SentryUserMode}
import io.sentry.{ITransaction, Sentry, SentryEvent, SpanStatus}
import io.sentry.transport.NoOpTransport
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.Materializer
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.{Configuration, Environment, Mode}
import play.api.http.{DefaultHttpRequestHandler, HttpConfiguration}
import play.api.libs.streams.Accumulator
import play.api.mvc.{EssentialAction, Handler, RequestHeader, Result, Results}
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest
import play.core.WebCommands

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

  test("finishes a transaction when downstream throws before returning a future") {
    val filter = new SentryTracingFilter(tracing, mat)
    var seen: Option[ITransaction] = None
    val error = new IllegalStateException("synchronous test failure")

    val thrown = intercept[IllegalStateException] {
      filter.apply { rh =>
        seen = SentryTracingFilter.transactionFor(rh)
        throw error
      }(routed(FakeRequest(), "/images/:id"))
    }

    thrown shouldBe error
    val transaction = seen.getOrElse(fail("No transaction attached"))
    transaction.isFinished shouldBe true
    transaction.getStatus shouldBe SpanStatus.INTERNAL_ERROR
  }

  Seq("failed future", "synchronous exception").foreach { failureMode =>
    test(s"links a filtered action's $failureMode using the outer request retained by Play's server") {
      @volatile var captured: Vector[SentryEvent] = Vector.empty
      Sentry.getCurrentScopes.getOptions.setBeforeSend { (event, _) =>
        captured = captured :+ event
        null
      }
      val errorHandler = new GridSentryErrorHandler(
        Environment.simple(mode = Mode.Prod), Configuration.empty, None, None, tracing
      )
      val error = new IllegalStateException("action failed")
      var seen: Option[ITransaction] = None
      val action = EssentialAction { request =>
        seen = SentryTracingFilter.transactionFor(request)
        if (failureMode == "synchronous exception") throw error
        else Accumulator.done(Future.failed[Result](error))
      }
      val router = Router.from {
        case _ => Handler.Stage.modifyRequest(routed(_, "/images/:id"), action)
      }
      val requestHandler = new SentryHttpRequestHandler(new DefaultHttpRequestHandler(
        org.mockito.Mockito.mock(classOf[WebCommands]), None, () => router, errorHandler, HttpConfiguration(),
        Seq(new SentryTracingFilter(tracing, mat))
      ))
      val (serverRequest, handler) = requestHandler.handlerForRequest(FakeRequest("GET", "/images/private-id"))
      val filteredAction = handler match {
        case essentialAction: EssentialAction => essentialAction
        case other => fail(s"Expected an EssentialAction, got $other")
      }

      // The server retains this request for recovery, not the copy passed down by a filter.
      val result = Future(filteredAction(serverRequest)).flatMap(_.run()).recoverWith {
        case failure => errorHandler.onServerError(serverRequest, failure)
      }

      whenReady(result)(_.header.status shouldBe 500)
      val transaction = seen.getOrElse(fail("No transaction attached"))
      transaction.isFinished shouldBe true
      transaction.getStatus shouldBe SpanStatus.INTERNAL_ERROR
      captured.size shouldBe 1
      val event = captured.head
      event.getThrowable shouldBe error
      event.getContexts.getTrace.getTraceId shouldBe transaction.getSpanContext.getTraceId
      event.getContexts.getTrace.getSpanId shouldBe transaction.getSpanContext.getSpanId
    }
  }

  test("keeps overlapping asynchronous requests on separate transactions") {
    val filter = new SentryTracingFilter(tracing, mat)
    val firstResponse = Promise[Result]()
    var first: Option[ITransaction] = None
    var second: Option[ITransaction] = None
    val firstRequest = SentryTracingFilter.withTransactionContext(routed(FakeRequest(), "/first"))
    val secondRequest = SentryTracingFilter.withTransactionContext(routed(FakeRequest(), "/second"))

    val pending = filter.apply { rh =>
      first = SentryTracingFilter.transactionFor(rh)
      firstResponse.future
    }(firstRequest)
    val completed = filter.apply { rh =>
      second = SentryTracingFilter.transactionFor(rh)
      ok(rh)
    }(secondRequest)

    whenReady(completed)(_.header.status shouldBe 200)
    val firstTransaction = first.getOrElse(fail("No first transaction"))
    val secondTransaction = second.getOrElse(fail("No second transaction"))
    SentryTracingFilter.transactionFor(firstRequest) shouldBe first
    SentryTracingFilter.transactionFor(secondRequest) shouldBe second
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
