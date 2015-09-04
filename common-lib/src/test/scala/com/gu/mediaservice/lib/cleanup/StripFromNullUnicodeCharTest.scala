package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class StripFromNullUnicodeCharTest extends FunSpec with Matchers with MetadataHelper {
  val invalidByline = "Ian Waldie\u0000\u0000"
  val invalidSource = "Getty Images\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0003\u0000\u0000\u0000\u0005\u0000\u0000\u0000\nï¿½ï¿½ï¿½ï¿½"

  it("should not change a valid name") {
    StripFromNullUnicodeChar.stripFromNullUnicodeChar("Getty Images") should be (Some("Getty Images"))
  }

  it ("should strip everything beyond a null unicode character") {
    StripFromNullUnicodeChar.stripFromNullUnicodeChar(invalidSource) should be (Some("Getty Images"))
  }

  it("should clean byline and source") {
    val metadata = createImageMetadata(
      "byline" -> invalidByline,
      "source" -> invalidSource
    )
    val cleanedMetadata = StripFromNullUnicodeChar.clean(metadata)
    cleanedMetadata.byline should be (Some("Ian Waldie"))
    cleanedMetadata.source should be (Some("Getty Images"))
  }

}
