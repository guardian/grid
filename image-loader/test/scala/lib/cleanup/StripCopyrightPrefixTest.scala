package scala.lib.cleanup

import lib.cleanup.StripCopyrightPrefix
import org.scalatest.{FunSpec, Matchers}

class StripCopyrightPrefixTest extends FunSpec with Matchers with MetadataHelper {

  it("should leave empty copyright empty") {
    val metadata = createImageMetadata()
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (None)
  }

  it("should leave unprefixed copyright as-is") {
    val metadata = createImageMetadata("copyright" -> "Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip any copyright symbol prefix") {
    val metadata = createImageMetadata("copyright" -> "© Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip any Copyright text prefix") {
    val metadata = createImageMetadata("copyright" -> "Copyright Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip lowercase copyright prefix") {
    val metadata = createImageMetadata("copyright" -> "copyright Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip Copyright of prefix") {
    val metadata = createImageMetadata("copyright" -> "Copyright of Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip copyright followed by colon prefix") {
    val metadata = createImageMetadata("copyright" -> "Copyright : Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip any (c) prefix") {
    val metadata = createImageMetadata("copyright" -> "(c) Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

  it("should strip a combination of copyright prefixes") {
    val metadata = createImageMetadata("copyright" -> "Copyright (c) Acme Corporation")
    val cleanedMetadata = StripCopyrightPrefix.clean(metadata)
    cleanedMetadata.copyright should be (Some("Acme Corporation"))
  }

}
