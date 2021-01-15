package com.gu.mediaservice.lib.aws

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json

class ThrallMessageSenderTest extends FunSpec with Matchers {

  import UpdateMessage._

  describe("json to message and back") {
    // This is most interested for ensuring time zone correctness
    it ("should convert a message to json and back again") {
      val m = UpdateMessage(subject = "test")
      val j = Json.toJson(m).toString()
      val m2 = Json.parse(j).as[UpdateMessage]
      m2 shouldEqual(m)
    }
  }

}
