package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class StripBylineFromCreditTest extends FunSpec with Matchers with MetadataHelper {

  it("should leave empty credit and byline empty") {
    val metadata = createImageMetadata()
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (None)
    cleanedMetadata.credit should be (None)
  }

  it("should strip the byline from the credit if a single name") {
    val metadata = bylineAndCredit("Guillermo Arias", "Guillermo Arias/Xinhua Press/Corbis")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Guillermo Arias"))
    cleanedMetadata.credit should be (Some("Xinhua Press/Corbis"))
  }

  it("should strip the byline from the credit if a single name when case doesn't match") {
    val metadata = bylineAndCredit("Guillermo Arias", "GUILLERMO ARIAS/Xinhua Press/Corbis")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Guillermo Arias"))
    cleanedMetadata.credit should be (Some("Xinhua Press/Corbis"))
  }

  it("should strip the byline from the credit as many times as needed") {
    val metadata = bylineAndCredit("Splash News", "Splash News/Splash News/Corbis")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Splash News"))
    cleanedMetadata.credit should be (Some("Corbis"))
  }

  // Note: leaving quite a lot of these no-op transformation tests for reference
  // and if we find a clever way to cleanup more by distinguishing agency from photographer prefixes

  it("should leave byline and credit as they are if each made of a single token") {
    val metadata = bylineAndCredit("Huw Evans", "REX")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Huw Evans"))
    cleanedMetadata.credit should be (Some("REX"))
  }

  it("should leave byline and credit as they are if equal and made of two tokens (agency name)") {
    val metadata = bylineAndCredit("Startraks Photo/REX", "Startraks Photo/REX")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Startraks Photo/REX"))
    cleanedMetadata.credit should be (Some("Startraks Photo/REX"))
  }

  it("should leave byline and credit as they are if equal and made of two tokens (actual photographer name)") {
    val metadata = bylineAndCredit("Huw Evans/REX", "Huw Evans/REX")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Huw Evans/REX"))
    cleanedMetadata.credit should be (Some("Huw Evans/REX"))
  }

  it("should leave byline and credit as they are if equal and made of more than two tokens (agency name)") {
    val metadata = bylineAndCredit("Warner Bros/Courtesy Everet/REX", "Warner Bros/Courtesy Everet/REX")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Warner Bros/Courtesy Everet/REX"))
    cleanedMetadata.credit should be (Some("Warner Bros/Courtesy Everet/REX"))
  }

  it("should leave byline and credit as they are if equal and made of more than two tokens (actual photographer name)") {
    val metadata = bylineAndCredit("Kieran McManus/BPI/REX", "Kieran McManus/BPI/REX")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Kieran McManus/BPI/REX"))
    cleanedMetadata.credit should be (Some("Kieran McManus/BPI/REX"))
  }

  it("should leave byline and credit as they are if the byline is a prefix of the credit") {
    val metadata = bylineAndCredit("Eduardo Valente/Frame/AGENCIA", "Eduardo Valente/Frame/AGENCIA/Xinhua Press/Corbis")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("Eduardo Valente/Frame/AGENCIA"))
    cleanedMetadata.credit should be (Some("Eduardo Valente/Frame/AGENCIA/Xinhua Press/Corbis"))
  }

  it("should leave byline and credit as they are if they are not tokenisable and equal") {
    val metadata = bylineAndCredit("PA", "PA")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("PA"))
    cleanedMetadata.credit should be (Some("PA"))
  }

  it("should leave byline and credit as they are if they are not tokenisable and not equal") {
    val metadata = bylineAndCredit("PA", "Pamela")
    val cleanedMetadata = StripBylineFromCredit.clean(metadata)
    cleanedMetadata.byline should be (Some("PA"))
    cleanedMetadata.credit should be (Some("Pamela"))
  }

  def bylineAndCredit(byline: String, credit: String) =
    createImageMetadata("byline" -> byline, "credit" -> credit)

}
