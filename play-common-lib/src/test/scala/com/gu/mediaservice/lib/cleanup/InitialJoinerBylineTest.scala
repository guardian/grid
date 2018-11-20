package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class InitialJoinerBylineTest extends FunSpec with Matchers with MetadataHelper {
  it("should squish initials together at the start") {
    val metadata = createImageMetadata("byline" -> "C P Scott")
    val cleanedMetadata = InitialJoinerByline.clean(metadata)

    cleanedMetadata.byline should be(Some("CP Scott"))
  }

  it("should squish initials together in the middle") {
    val metadata = createImageMetadata("byline" -> "First A B Last")
    val cleanedMetadata = InitialJoinerByline.clean(metadata)

    cleanedMetadata.byline should be(Some("First AB Last"))
  }

  it("should squish initials together at the end") {
    val metadata = createImageMetadata("byline" -> "First A B")
    val cleanedMetadata = InitialJoinerByline.clean(metadata)

    cleanedMetadata.byline should be(Some("First AB"))
  }

}
