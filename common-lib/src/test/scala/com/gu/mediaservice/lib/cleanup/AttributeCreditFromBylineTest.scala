package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class AttributeCreditFromBylineTest extends FunSpec with Matchers with MetadataHelper {

  val bylines = List("Sigmund Loch")
  val testCleaner = AttributeCreditFromByline(bylines, "Some Credit")

  it("should set the credit if the byline matches the configured list") {
    val metadata = createImageMetadata("byline" -> "Sigmund Loch")
    testCleaner.clean(metadata).credit should be (Some("Some Credit"))
  }

  it("should not set the credit if the byline doesn't matches the configured list") {
    val metadata = createImageMetadata("byline" -> "Someone else")
    testCleaner.clean(metadata).credit should be (None)
  }

}
