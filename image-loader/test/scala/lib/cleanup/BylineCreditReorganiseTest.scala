package scala.lib.cleanup

import lib.cleanup.ByLineCreditReorganise
import org.scalatest.{FunSpec, Matchers}

class BylineCreditReorganiseTest extends FunSpec with Matchers with MetadataHelper {

  it ("should leave non matching, slashed credits") {
    CreditByline("Ilyas Akengin", "AFP/Getty Images")
    .whenCleaned("Ilyas Akengin", "AFP/Getty Images")
  }

  it ("should remove spaces between slashes") {
    CreditByline("Man /In /Suit", "Presseye/ INPHO /REX")
    .whenCleaned("Man/In/Suit"  , "Presseye/INPHO/REX")
  }

  it ("should leave non matching byline and credit") {
    CreditByline("Ella/BPI/REX", "Ella Ling/BPI/REX")
    .whenCleaned("Ella/BPI/REX", "Ella Ling/BPI/REX")
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

  it ("should return the same if matching") {
      CreditByline("Barcroft Media", "Barcroft Media")
      .whenCleaned("Barcroft Media", "Barcroft Media")
  }

  it ("should return the same if no slashes") {
      CreditByline("Barcroft Media", "Philip Glass")
      .whenCleaned("Barcroft Media", "Philip Glass")
  }

  case class CreditByline(byline: String, credit: String) {
    def whenCleaned(cByline: String, cCredit: String) = {
      val metadata = createImageMetadata(
        "byline" -> byline,
        "credit" -> credit
      )
      val cleanMetadata = ByLineCreditReorganise.clean(metadata)

      cleanMetadata.byline should be (Some(cByline))
      cleanMetadata.credit should be (Some(cCredit))
    }
  }


}
