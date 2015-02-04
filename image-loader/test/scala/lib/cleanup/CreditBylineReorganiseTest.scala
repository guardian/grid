package scala.lib.cleanup

import lib.cleanup.CreditBylineReorganise
import org.scalatest.{FunSpec, Matchers}

class CreditBylineReorganiseTest extends FunSpec with Matchers with MetadataHelper {

  it ("should remove copyright information") {
    CreditByline("(c) Getty", "© Jane Hobson")
    .whenCleaned("Getty", "Jane Hobson")
  }

  it ("should leave non matching, slashed credits") {
    pending
    CreditByline("AFP/Getty Images", "Ilyas Akengin")
    .whenCleaned("AFP/Getty Images", "Ilyas Akengin")
  }

  it ("should move first value in triple slashed credit to byline if matching") {
    pending
    CreditByline("Jin Linpeng/Xinhua Press/Corbis", "Jin Linpeng")
    .whenCleaned("Xinhua Press/Corbis"            , "Jin Linpeng")
  }

  it ("should make this right") {
    pending
    CreditByline("Presseye / INPHO / REX", "Presseye / INPHO / REX")
    .whenCleaned("INPHO/REX"             , "Presseye")
  }

  it ("should move first value in double slashed credit to byline if matching (non-spaced)") {
    pending
    CreditByline("Andy Rowland/UK Sports Pics Ltd", "Andy Rowland")
    .whenCleaned("UK Sports Pics Ltd"             , "Andy Rowland")
  }

  it ("should move first value in double slashed credit to byline if matching (spaced)") {
    pending
    CreditByline("Zuma Press / eyevine", "Zuma Press / eyevine")
    .whenCleaned("eyevine", "Zuma Press")
  }

  it ("should empty matching byline if matching without slashes") {
    pending
    CreditByline("Barcroft Media", "Barcroft Media")
    .whenCleaned("Barcroft Media", "")
  }

  case class CreditByline(credit: String, byline: String) {
    def whenCleaned(cCredit: String, cByline: String) = {
      val metadata = createImageMetadata(
        "credit" -> credit,
        "byline" -> byline
      )
      val cleanMetadata = CreditBylineReorganise.clean(metadata)

      cleanMetadata.credit should be (Some(cCredit))
      cleanMetadata.byline should be (Some(cByline))
    }
  }


}
