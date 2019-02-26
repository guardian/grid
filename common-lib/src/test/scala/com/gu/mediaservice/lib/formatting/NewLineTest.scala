package com.gu.mediaservice.lib.formatting

import org.scalatest.{FunSpec, Matchers}

class NewLineTest extends FunSpec with Matchers {
  it("should replace \\r linebreaks with \\n") {
    val text = "Here is some text\rthat spans across\rmultiple lines\r"
    val normalisedText = normaliseNewLines(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should replace \\r\\n linebreaks with \\n") {
    val text = "Here is some text\r\nthat spans across\r\nmultiple lines\r\n"
    val normalisedText = normaliseNewLines(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }

  it("should not touch \\n linebreaks") {
    val text = "Here is some text\nthat spans across\nmultiple lines\n"
    val normalisedText = normaliseNewLines(text)
    normalisedText shouldBe "Here is some text\nthat spans across\nmultiple lines\n"
  }
}
