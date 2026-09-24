package com.gu.mediaservice.lib.config

import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers
import play.api.Configuration

class SentryConfigTest extends AnyFunSuiteLike with Matchers {

  // Placeholder only - never put a real DSN in the repository.
  private val dsn = "https://examplepublickey@o0.ingest.us.sentry.io/1"

  private def config(entries: (String, Any)*): Configuration = Configuration(entries: _*)

  private def deployed(entries: (String, Any)*) =
    SentryConfig(config(entries: _*), stage = "PROD", isDev = false)

  private def dev(entries: (String, Any)*) =
    SentryConfig(config(entries: _*), stage = "DEV", isDev = true)

  test("is disabled when no DSN is configured") {
    val c = deployed()
    c.enabled shouldBe false
    c.dsn shouldBe None
  }

  test("is disabled when the DSN is present but empty") {
    deployed("sentry.dsn" -> "   ").enabled shouldBe false
  }

  test("is enabled when a DSN is configured in a deployed environment") {
    deployed("sentry.dsn" -> dsn).enabled shouldBe true
  }

  test("is disabled in DEV even with a DSN, unless the developer opts in") {
    dev("sentry.dsn" -> dsn).enabled shouldBe false
    dev("sentry.dsn" -> dsn, "sentry.localOptIn" -> true).enabled shouldBe true
  }

  test("disables reporting rather than failing startup when the DSN is unusable") {
    val c = deployed("sentry.dsn" -> "not a uri at all")
    c.enabled shouldBe false
  }

  test("takes the Sentry environment from the Grid stage") {
    deployed("sentry.dsn" -> dsn).environment shouldBe "PROD"
    dev("sentry.dsn" -> dsn, "sentry.localOptIn" -> true).environment shouldBe "DEV"
  }

  test("defaults tracing and replay to off") {
    val c = deployed("sentry.dsn" -> dsn)
    c.tracesSampleRate shouldBe 0d
    c.replayOnErrorSampleRate shouldBe 0d
    c.tracingEnabled shouldBe false
  }

  test("reports tracing as enabled only when a DSN and a non-zero sample rate are both present") {
    deployed("sentry.tracesSampleRate" -> 0.5).tracingEnabled shouldBe false
    deployed("sentry.dsn" -> dsn, "sentry.tracesSampleRate" -> 0.5).tracingEnabled shouldBe true
  }

  test("rejects sample rates outside 0 to 1") {
    a[RuntimeException] should be thrownBy deployed("sentry.tracesSampleRate" -> 1.5)
    a[RuntimeException] should be thrownBy deployed("sentry.tracesSampleRate" -> -0.1)
    a[RuntimeException] should be thrownBy deployed("sentry.replay.onErrorSampleRate" -> 2)
  }

  test("accepts the boundary sample rates") {
    deployed("sentry.tracesSampleRate" -> 0).tracesSampleRate shouldBe 0d
    deployed("sentry.tracesSampleRate" -> 1).tracesSampleRate shouldBe 1d
  }

  test("captures only console errors by default") {
    deployed().consoleCaptureLevels shouldBe Seq("error")
  }

  test("allows console capture levels to be overridden, including to nothing") {
    deployed("sentry.console.levels" -> Seq("warn", "error")).consoleCaptureLevels shouldBe Seq("warn", "error")
    deployed("sentry.console.levels" -> Seq.empty[String]).consoleCaptureLevels shouldBe empty
  }

  test("defaults to anonymous user reporting") {
    deployed().userMode shouldBe SentryUserMode.Anonymous
  }

  test("only reports email when explicitly configured to") {
    deployed("sentry.user.mode" -> "email").userMode shouldBe SentryUserMode.Email
  }

  test("fails fast on an unrecognised user mode rather than silently falling back") {
    a[RuntimeException] should be thrownBy deployed("sentry.user.mode" -> "full-name")
  }

  test("refuses to identify users anonymously without a salt, since an unsalted hash is reversible") {
    deployed("sentry.dsn" -> dsn).canIdentifyUserAnonymously shouldBe false
    deployed("sentry.dsn" -> dsn, "sentry.user.salt" -> "  ").canIdentifyUserAnonymously shouldBe false
    deployed("sentry.dsn" -> dsn, "sentry.user.salt" -> "a-secret").canIdentifyUserAnonymously shouldBe true
  }

  test("derives the ingest origin from the DSN so the CSP can allow exactly that host") {
    deployed("sentry.dsn" -> dsn).ingestOrigin shouldBe Some("https://o0.ingest.us.sentry.io")
  }

  test("includes a non-default port in the derived ingest origin") {
    SentryConfig.originOf("https://key@sentry.internal:9000/1") shouldBe Some("https://sentry.internal:9000")
  }

  test("derives no ingest origin when there is no DSN") {
    deployed().ingestOrigin shouldBe None
  }

  test("sends no user identity at all when reporting is disabled") {
    deployed().userIdentity("someone@example.com", isPersonalData = true) shouldBe None
  }

  test("sends a machine caller's service name as-is, since it is not personal data") {
    val c = deployed("sentry.dsn" -> dsn)
    c.userIdentity("media-api", isPersonalData = false) shouldBe Some(SentryUserIdentity(id = Some("media-api")))
  }

  test("sends an email only when the mode explicitly asks for it") {
    val c = deployed("sentry.dsn" -> dsn, "sentry.user.mode" -> "email")
    c.userIdentity("someone@example.com", isPersonalData = true) shouldBe
      Some(SentryUserIdentity(email = Some("someone@example.com")))
  }

  test("sends a salted identifier, never the email, in anonymous mode") {
    val c = deployed("sentry.dsn" -> dsn, "sentry.user.salt" -> "a-secret")
    val identity = c.userIdentity("someone@example.com", isPersonalData = true)

    identity.flatMap(_.email) shouldBe None
    identity.flatMap(_.id) should not be empty
    identity.flatMap(_.id) should not contain "someone@example.com"
  }

  test("sends no identifier in anonymous mode when no salt is configured") {
    val c = deployed("sentry.dsn" -> dsn)
    c.userIdentity("someone@example.com", isPersonalData = true) shouldBe None
  }

  test("produces a stable identifier for the same user and a different one for another") {
    val c = deployed("sentry.dsn" -> dsn, "sentry.user.salt" -> "a-secret")
    val first = c.userIdentity("someone@example.com", isPersonalData = true)

    first shouldBe c.userIdentity("someone@example.com", isPersonalData = true)
    first should not be c.userIdentity("someone-else@example.com", isPersonalData = true)
  }

  test("produces different identifiers under different salts, so rotating the salt breaks correlation") {
    val identity = "someone@example.com"
    SentryConfig.anonymise("salt-one", identity) should not be SentryConfig.anonymise("salt-two", identity)
  }
}
