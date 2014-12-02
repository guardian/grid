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

  // Exception: United Kingdom

  it("should map the UK country code to United Kingdom") {
    clean("UK") should be (Some("United Kingdom"))
  }

  it("should map the GB country code to United Kingdom") {
    clean("GB") should be (Some("United Kingdom"))
  }

  // Exception: United States

  it("should map the US country code to United States") {
    clean("US") should be (Some("United States"))
  }

  it("should map the USA country code to United States") {
    clean("USA") should be (Some("United States"))
  }


  def clean(country: String): Option[String] = {
    CountryCode.clean(createImageMetadata("country" -> country)).country
  }

}


