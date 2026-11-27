package com.gu.mediaservice.lib.play

import ch.qos.logback.classic.{Logger, LoggerContext}
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.AppenderBase
import com.gu.mediaservice.lib.auth.Authentication.InnerServicePrincipal
import net.logstash.logback.encoder.LogstashEncoder
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.Materializer
import org.scalatest.BeforeAndAfterAll
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Seconds, Span}
import org.slf4j.LoggerFactory
import play.api.libs.json.{JsValue, Json}
import play.api.mvc.{RequestHeader, Results}
import play.api.test.FakeRequest

import java.util.concurrent.ConcurrentLinkedQueue
import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.jdk.CollectionConverters._

class RequestLoggingFilterTest extends AnyFunSuite with Matchers with ScalaFutures with BeforeAndAfterAll {
  private implicit val system: ActorSystem = ActorSystem("RequestLoggingFilterTest")
  private implicit val mat: Materializer = Materializer(system)
  private implicit val ec: ExecutionContext = system.dispatcher
  override implicit val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(5, Seconds))
  private val filter = new RequestLoggingFilter(mat)
  private val testPath = "/request-logging-filter-test/images"

  override def afterAll(): Unit = {
    system.terminate()
    super.afterAll()
  }

  private def withLogs(count: Int = 1)(testBody: Future[List[JsValue]] => Unit): Unit = {
    val logger = LoggerFactory.getLogger("request").asInstanceOf[Logger]
    val encoder = new LogstashEncoder()
    encoder.setContext(LoggerFactory.getILoggerFactory.asInstanceOf[LoggerContext])
    encoder.start()
    val events = new ConcurrentLinkedQueue[JsValue]()
    val captured = Promise[List[JsValue]]()
    val appender = new AppenderBase[ILoggingEvent] {
      override def append(event: ILoggingEvent): Unit = {
        val entry = Json.parse(encoder.encode(event))
        if ((entry \ "path").asOpt[String].contains(testPath)) {
          events.add(entry)
          if (events.size() == count) captured.trySuccess(events.asScala.toList)
        }
      }
    }
    appender.start()
    logger.addAppender(appender)
    try testBody(captured.future)
    finally {
      logger.detachAppender(appender)
      appender.stop()
      encoder.stop()
    }
  }

  test("logs WAF matches and request metadata while preserving request ids and authentication markers") {
    withLogs() { logs =>
      val wafHeaders = RequestLoggingFilter.wafHeaderNames.map(_ -> "matched")
      val request = FakeRequest("GET", s"$testPath?query=cat").withHeaders(
        (wafHeaders.map { case (name, value) => name.toUpperCase(java.util.Locale.ROOT) -> value } ++ Seq(
          "Host" -> "grid.example.com",
          "X-Forwarded-For" -> " 203.0.113.1 , 10.0.0.1",
          "Referer" -> "https://grid.example.com/",
          "User-Agent" -> "test-agent",
          "X-Amz-Cf-Id" -> "cloudfront-request",
          "X-Unrelated-Header" -> "not logged"
        )): _*
      )
      var seen: Option[RequestHeader] = None
      val response = Results.Ok("body").addAttr(RequestLoggingFilter.requestPrincipal, InnerServicePrincipal("media-api"))
      val result = filter.apply { forwarded =>
        seen = Some(forwarded)
        Future.successful(response)
      }(request)

      whenReady(result)(_ shouldBe response)
      whenReady(logs) { events =>
        val event = events.head
        wafHeaders.foreach { case (name, value) => (event \ name).as[String] shouldBe value }
        (event \ "wafMatched").as[String] shouldBe "true"
        (event \ "clientIp").as[String] shouldBe "203.0.113.1"
        (event \ "origin").as[String] shouldBe " 203.0.113.1 , 10.0.0.1"
        (event \ "host").as[String] shouldBe "grid.example.com"
        (event \ "method").as[String] shouldBe "GET"
        (event \ "path").as[String] shouldBe testPath
        (event \ "query").as[String] shouldBe "query=cat"
        (event \ "userAgent").as[String] shouldBe "test-agent"
        (event \ "cloudfrontId").as[String] shouldBe "cloudfront-request"
        (event \ "referrer").as[String] shouldBe "https://grid.example.com/"
        (event \ "status").as[Int] shouldBe 200
        (event \ "duration").as[Long] should be >= 0L
        (event \ "requestId").as[String] shouldBe seen.flatMap(RequestLoggingFilter.requestIdFor).get
        (event \ "api-key").as[String] shouldBe "media-api"
        (event \ "X-Unrelated-Header").toOption shouldBe None
        (event \ "message").as[String] should include ("WAF match [admin-protection-rule-set, amazon-ip-reputation-list, anonymous-ip-list, common-rule-set, known-bad-inputs-rule-set, linux-rule-set, unix-rule-set]")
      }
    }
  }

  test("falls back to the remote address and records no WAF match when headers are absent") {
    withLogs() { logs =>
      val request = FakeRequest("GET", testPath)
      whenReady(filter.apply(_ => Future.successful(Results.NotFound))(request))(_.header.status shouldBe 404)
      whenReady(logs) { events =>
        val event = events.head
        (event \ "clientIp").as[String] shouldBe request.remoteAddress
        (event \ "wafMatched").as[String] shouldBe "false"
        (event \ "userAgent").as[String] shouldBe ""
        (event \ "cloudfrontId").as[String] shouldBe ""
        (event \ "query").as[String] shouldBe ""
        (event \ "status").as[Int] shouldBe 404
        RequestLoggingFilter.wafHeaderNames.foreach(name => (event \ name).toOption shouldBe None)
        (event \ "message").as[String] should not include "WAF match"
      }
    }
  }

  test("limits the structured query field to 500 characters") {
    withLogs() { logs =>
      val query = "q=" + ("a" * 600)
      whenReady(filter.apply(_ => Future.successful(Results.Ok))(FakeRequest("GET", s"$testPath?$query")))(
        _.header.status shouldBe 200
      )
      whenReady(logs)(events => (events.head \ "query").as[String] shouldBe query.take(500))
    }
  }

  test("logs WAF metadata for failed requests without replacing the failure") {
    withLogs(count = 2) { logs =>
      val error = new IllegalStateException("test failure")
      val request = FakeRequest("GET", testPath).withHeaders("x-amzn-waf-common-rule-set" -> "matched")
      whenReady(filter.apply(_ => Future.failed(error))(request).failed)(_ shouldBe error)
      whenReady(logs) { events =>
        events.map(event => (event \ "level").as[String]) shouldBe List("INFO", "ERROR")
        events.foreach { event =>
          (event \ "status").as[String] shouldBe "exception"
          (event \ "wafMatched").as[String] shouldBe "true"
          (event \ "x-amzn-waf-common-rule-set").as[String] shouldBe "matched"
        }
        (events.head \ "message").as[String] should include ("WAF match [common-rule-set]")
      }
    }
  }
}
