package com.gu.mediaservice.lib.aws

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json
import org.joda.time.{DateTime, DateTimeZone}

class ThrallMessageSenderTest extends FunSpec with Matchers {

  import UpdateMessage._

  describe("json to message and back") {
    // This is most interested for ensuring time zone correctness
    it ("should convert a message to json and back again") {
      val m = UpdateMessage(subject = "test")
      val j = Json.toJson(m).toString()
      val m2 = Json.parse(j).as[UpdateMessage]
      m2 shouldEqual m
    }

    it ("should convert a message last modified with an offset timezone to UTC") {
      val now = DateTime.now(DateTimeZone.forOffsetHours(9))
      val nowUtc = new DateTime(now.getMillis()).toDateTime(DateTimeZone.UTC)
      val m = UpdateMessage(subject = "test", lastModified = now)
      val j = Json.toJson(m).toString()
      val m2 = Json.parse(j).as[UpdateMessage]
      m2 shouldEqual m.copy(lastModified = nowUtc)
    }
  }

}
