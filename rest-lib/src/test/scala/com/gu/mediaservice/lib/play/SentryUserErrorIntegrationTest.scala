package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.auth.Authentication.{InnerServicePrincipal, MachinePrincipal, UserPrincipal}
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.auth.{ApiAccessor, Authentication, Internal}
import com.gu.mediaservice.lib.config.{CommonConfig, SentryConfig}
import io.sentry.{Sentry, SentryEvent}
import io.sentry.transport.NoOpTransport
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.Materializer
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{mock, when}
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import play.api.http.{DefaultHttpRequestHandler, HttpConfiguration, HttpRequestHandler}
import play.api.mvc.{EssentialAction, Handler, PlayBodyParsers, RequestHeader, Result, Results}
import play.api.routing.{HandlerDef, Router}
import play.api.test.FakeRequest
import play.api.{Configuration, Environment, Mode}
import play.core.WebCommands

import java.util.concurrent.ConcurrentLinkedQueue
import scala.concurrent.{Future, Promise}
import scala.jdk.CollectionConverters._

class SentryUserErrorIntegrationTest extends AnyFunSuite with Matchers with ScalaFutures with BeforeAndAfterAll with BeforeAndAfterEach {
  private implicit val system: ActorSystem = ActorSystem("SentryUserErrorIntegrationTest")
  private implicit val mat: Materializer = Materializer(system)
  private implicit val ec: scala.concurrent.ExecutionContext = system.dispatcher
  private val captured = new ConcurrentLinkedQueue[SentryEvent]()

  private val sentryConfig = SentryConfig(
    dsn = Some("https://key@sentry.example.com/1"), environment = "TEST",
    tracesSampleRate = 0, consoleCaptureLevels = Seq("error")
  )
  private val errorHandler = new GridSentryErrorHandler(
    Environment.simple(mode = Mode.Prod), Configuration.empty, None, None, sentryConfig
  )

  override def beforeEach(): Unit = {
    super.beforeEach()
    captured.clear()
    Sentry.init { options =>
      options.setDsn("https://key@sentry.example.com/1")
      options.setSendDefaultPii(false)
      options.setTracesSampleRate(1d)
      options.setTransportFactory((_, _) => NoOpTransport.getInstance())
      options.setBeforeSend { (event, _) =>
        captured.add(event)
        null
      }
    }
  }

  override def afterEach(): Unit =
    try Sentry.close()
    finally super.afterEach()

  override def afterAll(): Unit = {
    system.terminate()
    super.afterAll()
  }

  private def authentication(): Authentication = {
    val userProvider = mock(classOf[UserAuthenticationProvider])
    val apiProvider = mock(classOf[MachineAuthenticationProvider])
    val innerProvider = mock(classOf[InnerServiceAuthenticationProvider])
    when(userProvider.loginLink).thenReturn(DisableLoginLink)
    when(apiProvider.authenticateRequest(any(classOf[RequestHeader]))).thenAnswer { invocation =>
      val request = invocation.getArgument[RequestHeader](0)
      if (request.headers.get("X-Test-Machine").isDefined)
        Authenticated(MachinePrincipal(ApiAccessor("machine-name", Internal)))
      else NotAuthenticated
    }
    when(userProvider.authenticateRequest(any(classOf[RequestHeader]))).thenAnswer { invocation =>
      val request = invocation.getArgument[RequestHeader](0)
      request.headers.get("X-Test-User") match {
        case Some("before-authentication-error") => throw new IllegalStateException("authentication failed")
        case Some("grace@example.com") => GracePeriod(UserPrincipal("Test", "User", "grace@example.com"))
        case Some(email) => Authenticated(UserPrincipal("Test", "User", email))
        case None => NotAuthenticated
      }
    }
    when(innerProvider.authenticateRequest(any(classOf[RequestHeader]))).thenAnswer { invocation =>
      val request = invocation.getArgument[RequestHeader](0)
      if (request.headers.get("X-Test-Inner-Service").isDefined) Authenticated(InnerServicePrincipal("media-api"))
      else NotAuthenticated
    }
    new Authentication(
      mock(classOf[CommonConfig]), AuthenticationProviders(userProvider, apiProvider, innerProvider),
      PlayBodyParsers().default, ec
    )
  }

  private def run(action: EssentialAction, request: RequestHeader): Future[Result] = {
    val router = Router.from { case _ => action }
    val handler = new SentryUserRequestHandler(new DefaultHttpRequestHandler(
      mock(classOf[WebCommands]), None, () => router, errorHandler, HttpConfiguration(),
      Seq(new RequestLoggingFilter(mat))
    ))
    val (serverRequest, routed) = handler.handlerForRequest(request)
    val filtered = routed match {
      case a: EssentialAction => a
      case other => fail(s"Expected an EssentialAction, got $other")
    }
    Future(filtered(serverRequest)).flatMap(_.run()).recoverWith {
      case error => errorHandler.onServerError(serverRequest, error)
    }
  }

  test("attaches the authenticated user's email to an asynchronously failing Play action") {
    val error = new IllegalStateException("user action failed")
    val action = authentication().async(_ => Future.failed(error))
    whenReady(run(action, FakeRequest().withHeaders("X-Test-User" -> "person@example.com"))) {
      _.header.status shouldBe 500
    }
    val event = captured.asScala.toList match {
      case List(single) => single
      case events => fail(s"Expected one event, got ${events.size}")
    }
    event.getThrowable shouldBe error
    event.getUser.getEmail shouldBe "person@example.com"
    event.getUser.getId shouldBe null
  }

  test("retains the authenticated email when an action throws synchronously") {
    val error = new IllegalStateException("synchronous action failure")
    val action = authentication().async(_ => throw error)
    whenReady(run(action, FakeRequest().withHeaders("X-Test-User" -> "person@example.com"))) {
      _.header.status shouldBe 500
    }
    captured.asScala.toList.map(_.getUser.getEmail) shouldBe List("person@example.com")
  }

  test("direct authenticationStatus callers carry the user to Play's outer error handler") {
    val delegate = new HttpRequestHandler {
      override def handlerForRequest(request: RequestHeader): (RequestHeader, Handler) =
        request -> EssentialAction(_ => play.api.libs.streams.Accumulator.done(Results.Ok))
    }
    val handler = new SentryUserRequestHandler(delegate)
    val (serverRequest, _) = handler.handlerForRequest(FakeRequest().withHeaders("X-Test-User" -> "person@example.com"))
    val auth = authentication()
    auth.authenticationStatus(serverRequest, gracePeriodCountsAsAuthenticated = false).isRight shouldBe true

    whenReady(errorHandler.onServerError(serverRequest, new IllegalStateException("direct auth failure"))) {
      _.header.status shouldBe 500
    }
    captured.asScala.toList.map(_.getUser.getEmail) shouldBe List("person@example.com")
  }

  test("records a grace-period user only when that request accepts the grace period") {
    val auth = authentication()
    val accepted = SentryUserContext.withContext(FakeRequest().withHeaders("X-Test-User" -> "grace@example.com"))
    val rejected = SentryUserContext.withContext(FakeRequest().withHeaders("X-Test-User" -> "grace@example.com"))
    auth.authenticationStatus(accepted, gracePeriodCountsAsAuthenticated = true).isRight shouldBe true
    auth.authenticationStatus(rejected, gracePeriodCountsAsAuthenticated = false).isLeft shouldBe true
    SentryUserContext.emailFor(accepted) shouldBe Some("grace@example.com")
    SentryUserContext.emailFor(rejected) shouldBe None
  }

  test("does not add an authenticated user to errors before authentication") {
    val action = authentication().async(_ => Future.successful(Results.Ok))
    whenReady(run(action, FakeRequest().withHeaders("X-Test-User" -> "before-authentication-error"))) {
      _.header.status shouldBe 500
    }
    val events = captured.asScala.toList
    events.size shouldBe 1
    Option(events.head.getUser).flatMap(user => Option(user.getEmail)) shouldBe None
    Option(events.head.getUser).flatMap(user => Option(user.getId)) shouldBe None
  }

  test("does not treat machine or inner-service principals as user emails") {
    val auth = authentication()
    val action = auth.allowInnerService.async(_ => Future.failed(new IllegalStateException("service action failed")))
    whenReady(run(action, FakeRequest().withHeaders("X-Test-Machine" -> "secret"))) {
      _.header.status shouldBe 500
    }
    whenReady(run(action, FakeRequest().withHeaders("X-Test-Inner-Service" -> "secret"))) {
      _.header.status shouldBe 500
    }
    val events = captured.asScala.toList
    events.size shouldBe 2
    events.foreach { event =>
      Option(event.getUser).flatMap(user => Option(user.getEmail)) shouldBe None
      Option(event.getUser).flatMap(user => Option(user.getId)) shouldBe None
    }
  }

  test("keeps overlapping authenticated requests on their own users") {
    val responses = Map("first@example.com" -> Promise[Result](), "second@example.com" -> Promise[Result]())
    val auth = authentication()
    val action = auth.async(request => responses(request.user.accessor.identity).future)
    val first = run(action, FakeRequest().withHeaders("X-Test-User" -> "first@example.com"))
    val second = run(action, FakeRequest().withHeaders("X-Test-User" -> "second@example.com"))
    val firstError = new IllegalStateException("first")
    val secondError = new IllegalStateException("second")
    responses("second@example.com").failure(secondError)
    responses("first@example.com").failure(firstError)

    whenReady(first)(_.header.status shouldBe 500)
    whenReady(second)(_.header.status shouldBe 500)
    val usersByError = captured.asScala.map(event => event.getThrowable -> event.getUser.getEmail).toMap
    usersByError shouldBe Map(firstError -> "first@example.com", secondError -> "second@example.com")
  }

  test("keeps both authenticated email and distributed trace on a failed action") {
    val error = new IllegalStateException("traced action failed")
    val action = authentication().async(_ => Future.failed(error))
    val router = Router.from {
      case _ => Handler.Stage.modifyRequest(
        _.addAttr(Router.Attrs.HandlerDef, HandlerDef(
          getClass.getClassLoader, "router", "controllers.Test", "index", Seq.empty, "GET", "/images/:id"
        )),
        action
      )
    }
    val tracingConfig = sentryConfig.copy(tracesSampleRate = 1d)
    val handler = new SentryUserRequestHandler(new SentryHttpRequestHandler(new DefaultHttpRequestHandler(
      mock(classOf[WebCommands]), None, () => router, errorHandler, HttpConfiguration(),
      Seq(new SentryTracingFilter(tracingConfig, mat))
    )))
    val traceId = "0123456789abcdef0123456789abcdef"
    val (serverRequest, routed) = handler.handlerForRequest(FakeRequest("GET", "/images/private-id").withHeaders(
      "X-Test-User" -> "person@example.com",
      "sentry-trace" -> s"$traceId-0123456789abcdef-1"
    ))
    val filtered = routed match {
      case a: EssentialAction => a
      case other => fail(s"Expected an EssentialAction, got $other")
    }
    val result = Future(filtered(serverRequest)).flatMap(_.run()).recoverWith {
      case failure => errorHandler.onServerError(serverRequest, failure)
    }

    whenReady(result)(_.header.status shouldBe 500)
    val events = captured.asScala.toList
    events.size shouldBe 1
    events.head.getThrowable shouldBe error
    events.head.getUser.getEmail shouldBe "person@example.com"
    events.head.getContexts.getTrace.getTraceId.toString shouldBe traceId
    events.head.getContexts.getTrace.getSpanId shouldBe
      SentryTracingFilter.transactionFor(serverRequest).get.getSpanContext.getSpanId
  }
}
