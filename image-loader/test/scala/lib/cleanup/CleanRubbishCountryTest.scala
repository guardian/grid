package scala.lib.cleanup

import lib.cleanup.CleanRubbishCountry
import org.scalatest.{FunSpec, Matchers}

class CleanRubbishCountryTest extends FunSpec with Matchers with MetadataHelper {

  it("should not change a correct country name") {
    clean("Switzerland") should be (Some("Switzerland"))
  }

  it("should strip whitespace names") {
    clean(" ") should be (None)
  }

  it("should strip '.' names") {
    clean(".") should be (None)
  }

  it("should strip '-' names") {
    clean("-") should be (None)
  }

  it("should strip '-' names with whitespace") {
    clean("  - ") should be (None)
  }



  def clean(country: String): Option[String] = {
    CleanRubbishCountry.clean(createImageMetadata("country" -> country)).country
  }

}


