package com.gu.mediaservice.lib.config

import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.Configuration

class SentryConfigTest extends AnyFunSuiteLike with Matchers {
  private val dsn = "https://key@sentry.example.com/1"

  private def deployed(entries: (String, Any)*): SentryConfig =
    SentryConfig(Configuration(entries: _*), stage = "PROD", isDev = false)

  test("is disabled for absent, empty and unusable DSNs") {
    deployed().enabled shouldBe false
    deployed("sentry.dsn" -> "   ").enabled shouldBe false
    deployed("sentry.dsn" -> "not a uri").enabled shouldBe false
  }

  test("is enabled in deployed environments and uses the Grid stage") {
    val config = deployed("sentry.dsn" -> dsn)
    config.enabled shouldBe true
    config.environment shouldBe "PROD"
  }

  test("requires explicit local opt-in even when a DSN is configured") {
    SentryConfig(Configuration("sentry.dsn" -> dsn), "DEV", isDev = true).enabled shouldBe false
    SentryConfig(Configuration("sentry.dsn" -> dsn, "sentry.localOptIn" -> true), "DEV", isDev = true).enabled shouldBe true
  }

  test("derives only the ingest origin, including non-default ports") {
    deployed("sentry.dsn" -> dsn).ingestOrigin shouldBe Some("https://sentry.example.com")
    SentryConfig.originOf("https://key@sentry.example.com:9000/1") shouldBe Some("https://sentry.example.com:9000")
    deployed().ingestOrigin shouldBe None
  }

  test("captures console errors by default and supports overriding or disabling capture") {
    deployed().consoleCaptureLevels shouldBe Seq("error")
    deployed("sentry.console.levels" -> Seq(" WARN ", "error")).consoleCaptureLevels shouldBe Seq("warn", "error")
    deployed("sentry.console.levels" -> Seq.empty[String]).consoleCaptureLevels shouldBe empty
  }
}
