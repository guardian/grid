package scala.lib.cleanup

import lib.cleanup.CountryCode
import org.scalatest.{FunSpec, Matchers}


class CountryCodeTest extends FunSpec with Matchers with MetadataHelper {

  it("should not change a correct country name") {
    clean("Switzerland") should be (Some("Switzerland"))
  }

  it("should not change an uppercase country name") {
    clean("SWITZERLAND") should be (Some("SWITZERLAND"))
  }

  it("should map a 2-letter country code to its name") {
    clean("CH") should be (Some("Switzerland"))
  }

  it("should not change an invalid 2-letter country code") {
    clean("XX") should be (Some("XX"))
  }

  it("should map a 3-letter country code to its name") {
    clean("CHN") should be (Some("China"))
  }

  it("should not change an invalid 3-letter country code") {
    clean("XXX") should be (Some("XXX"))
  }

  def clean(country: String): Option[String] = {
    CountryCode.clean(createImageMetadata("country" -> country)).country
  }

}


