package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class StripCopyrightPrefixTest extends FunSpec with Matchers with MetadataHelper {

  it("should leave empty copyright empty") {
    val metadata = createImageMetadata()
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (None)
  }

  it("should leave unprefixed byline as-is") {
    val metadata = createImageMetadata("credit" -> "Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip any copyright symbol prefix") {
    val metadata = createImageMetadata("credit" -> "© Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip any Copyright text prefix") {
    val metadata = createImageMetadata("credit" -> "Copyright Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip lowercase copyright prefix") {
    val metadata = createImageMetadata("credit" -> "copyright Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip Copyright of prefix") {
    val metadata = createImageMetadata("credit" -> "Copyright of Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip copyright followed by colon prefix") {
    val metadata = createImageMetadata("credit" -> "Copyright : Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip any (c) prefix") {
    val metadata = createImageMetadata("credit" -> "(c) Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip a combination of copyright prefixes") {
    val metadata = createImageMetadata("credit" -> "Copyright (c) Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should strip these from byline and credit") {
    val metadata = createImageMetadata(
      "byline" -> "© Acme Corporation",
      "credit" -> "© Acme Corporation",
    )
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.byline should be (Some("Acme Corporation"))
    cleanedMetadata.credit should be (Some("Acme Corporation"))
  }

  it("should leave these in fields like description") {
    val metadata = createImageMetadata(
      "description" -> "© Acme Corporation"
    )
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.description should be (Some("© Acme Corporation"))
  }

}
