package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class BylineCreditReorganiseTest extends FunSpec with Matchers with MetadataHelper {

  it ("should leave non matching, slashed credits") {
    CreditByline("Ilyas Akengin", "AFP/Getty Images")
    .whenCleaned("Ilyas Akengin", "AFP/Getty Images")
  }

  it ("should remove spaces between slashes") {
    CreditByline("Man /In /Suit", "Presseye/ INPHO /REX")
    .whenCleaned("Man"  , "In/Suit/Presseye/INPHO/REX")
  }

  it ("should clean credits from byline but leave non-matching name") {
    CreditByline("Ella/BPI/REX", "Ella Ling/BPI/REX")
    .whenCleaned("Ella", "Ella Ling/BPI/REX")
  }

  it ("should normalise via to slash") {
    CreditByline("Philip Glass", "Anadolu Agency via Getty Images")
      .whenCleaned("Philip Glass", "Anadolu Agency/Getty Images")
  }

  it ("should remove matching byline from credit in triple slash") {
    CreditByline("Ella Ling/BPI/REX", "Ella Ling/BPI/REX")
    .whenCleaned("Ella Ling"        , "BPI/REX")
  }

  it ("should remove matching byline from double slash credit") {
    CreditByline("Joe Newman / National Pictures", "Joe Newman / National Pictures")
    .whenCleaned("Joe Newman"                    , "National Pictures")
  }

  it ("should remove the byline from credit if matching") {
    CreditByline("Andy Rowland", "Andy Rowland/UK Sports Pics Ltd")
    .whenCleaned("Andy Rowland", "UK Sports Pics Ltd")
  }

  it ("should remove the byline from credit if matching, via case") {
    CreditByline("Andy Rowland", "Andy Rowland via UK Sports Pics Ltd")
      .whenCleaned("Andy Rowland", "UK Sports Pics Ltd")
  }

  it ("should return the same if matching") {
      CreditByline("Barcroft Media", "Barcroft Media")
      .whenCleaned("Barcroft Media", "Barcroft Media")
  }

  it ("should return the same if no slashes") {
      CreditByline("Barcroft Media", "Philip Glass")
      .whenCleaned("Barcroft Media", "Philip Glass")
  }

  it ("should remove organisation from byline") {
    CreditByline("Philip Glass/Barcroft Media", "Barcroft Media")
      .whenCleaned("Philip Glass", "Barcroft Media")
  }

  it ("should remove organisation from byline, via case") {
    CreditByline("Philip Glass via Barcroft Media", "Barcroft Media")
      .whenCleaned("Philip Glass", "Barcroft Media")
  }

  it ("should handle empty byline") {
    CreditByline("", "Barcroft Media")
      .whenCleaned("", "Barcroft Media")
  }

  it ("should handle empty credit") {
    CreditByline("John Doe", "")
      .whenCleaned("John Doe", None)
  }

  it ("should handle empty credit when byline has organisation names") {
    CreditByline("John Doe/BPI/REX", "")
      .whenCleaned("John Doe", "BPI/REX")
  }

  it ("should handle empty credit when byline has organisation names, via case") {
    CreditByline("John Doe via BPI/REX", "")
      .whenCleaned("John Doe", "BPI/REX")
  }

  case class CreditByline(byline: String, credit: String) {
    def whenCleaned(cByline: String, cCredit: Option[String]) = {
      val metadata = createImageMetadata(
        "byline" -> byline,
        "credit" -> credit
      )

      val cleanMetadata = BylineCreditReorganise.clean(metadata)

      cleanMetadata.byline should be (Some(cByline))
      cleanMetadata.credit should be (cCredit)
    }

    def whenCleaned(cByline: String, cCredit: String) = {
      val metadata = createImageMetadata(
        "byline" -> byline,
        "credit" -> credit
      )
      val cleanMetadata = BylineCreditReorganise.clean(metadata)

      cleanMetadata.byline should be (Some(cByline))
      cleanMetadata.credit should be (Some(cCredit))
    }
  }


}
