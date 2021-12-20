package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class GuardianStyleBylineTest extends FunSpec with Matchers with MetadataHelper {
  it("should replace straight quotes with curly quotes") {
    val metadata = createImageMetadata("byline" -> "Sam O'neill")
    val cleanedMetadata = GuardianStyleByline.clean(metadata)

    cleanedMetadata.byline should be (Some("Sam O’neill"))
  }

  it("should remove dots in initials") {
    val metadata = createImageMetadata("byline" -> "First M. Last")
    val cleanedMetadata = GuardianStyleByline.clean(metadata)

    cleanedMetadata.byline should be (Some("First M Last"))
  }

  it("should remove dots in initials and insert spaces in unusual cases") {
    val metadata = createImageMetadata("byline" -> "Ishara S.kodikara")
    val cleanedMetadata = GuardianStyleByline.clean(metadata)

    // NOTE: The capitalisation cleaner should handle this becoming Title Case
    cleanedMetadata.byline should be(Some("Ishara S kodikara"))
  }
}
