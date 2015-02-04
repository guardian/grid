package scala.lib.cleanup

import lib.cleanup.CreditBylineReorganise
import org.scalatest.{FunSpec, Matchers}

class CreditBylineReorganiseTest extends FunSpec with Matchers with MetadataHelper {

  it ("should remove copyright information") {
    CreditByline("(c) Getty", "© Jane Hobson")
    .whenCleaned("Getty", "Jane Hobson")
  }

  it ("should leave non matching, non spaced, slashed credits") {
    CreditByline("AFP/Getty Images", "Ilyas Akengin")
    .whenCleaned("AFP/Getty Images", "Ilyas Akengin")
  }

  it ("should remove spaces between slashes") {
    CreditByline("Presseye/ INPHO /REX", "Man /In /Suit")
    .whenCleaned("Presseye/INPHO/REX", "Man/In/Suit")
  }




  it ("should leave non matching byline and credit") {
    CreditByline("Ella/BPI/REX", "Ella Ling/BPI/REX")
    .whenCleaned("Ella/BPI/REX", "Ella Ling/BPI/REX")
  }

  it ("should remove matching byline from credit") {
    CreditByline("Ella Ling/BPI/REX", "Ella Ling/BPI/REX")
    .whenCleaned("BPI/REX", "Ella Ling")
  }

  it ("should remove matching byline from credit 2") {
    CreditByline("Jin Linpeng/Xinhua Press/Corbis", "Jin Linpeng")
    .whenCleaned("Xinhua Press/Corbis"            , "Jin Linpeng")
  }



  it ("should remove matching byline in slashed credit u") {
    pending
    CreditByline("Jin Linpeng/Xinhua Press/Corbis", "Jin Linpeng/Xinhua Press")
    .whenCleaned("Xinhua Press/Corbis"            , "Jin Linpeng")
  }

  it ("should move first value in double slashed credit to byline if matching") {
    pending
    CreditByline("Andy Rowland/UK Sports Pics Ltd", "Andy Rowland")
    .whenCleaned("UK Sports Pics Ltd"             , "Andy Rowland")
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
