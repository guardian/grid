package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.FileMetadata
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.{JsArray, JsString}


class CountryCodeTest extends FunSpec with Matchers with MetadataHelper {

  it("should not change a correct country name") {
    // no matter where you put Switzerland, it should come out as Switzerland
    all(clean("Switzerland", "Switzerland")) should be(Some("Switzerland"))
  }

  it("should not change an uppercase country name") {
    all(clean("SWITZERLAND", "SWITZERLAND")) should be(Some("SWITZERLAND"))
  }

  it("should map a 2-letter country code to its name") {
    all(clean("CH", "Confoederatio Helvetica")) should be(Some("Switzerland"))
  }

  it("should not change an invalid 2-letter country code") {
    all(clean("XX", "XX")) should be(Some("XX"))
  }

  it("should map a 3-letter country code to its name") {
    all(clean("CHN", "")) should be(Some("China"))
  }

  it("should not change an invalid 3-letter country code") {
    all(clean("XXX", "XXX")) should be(Some("XXX"))
  }

  // Exception: United Kingdom

  it("should map the UK country code to United Kingdom") {
    all(clean("UK", "Plague Island")) should be(Some("United Kingdom"))
  }

  it("should map the GB country code to United Kingdom") {
    all(clean("GB", "Brittany")) should be(Some("United Kingdom"))
  }

  // Exception: United States

  it("should map the US country code to United States") {
    all(clean("US", "America")) should be(Some("United States"))
  }

  it("should map the USA country code to United States") {
    all(clean("USA", "America")) should be(Some("United States"))
  }


  def clean(code: String, name: String): List[Option[String]] = {
    List(
      CountryCode.clean(
        createImageMetadata("country" -> name),
        fileMetadata(maybeIptcCountryCode = Some(code), maybeIptcCountryName = Some(name))).country,
      CountryCode.clean(
        createImageMetadata("country" -> name),
        fileMetadata(maybeIptcXmpCountryCode = Some(code), maybeIptcCountryName = Some(name))).country,
      CountryCode.clean(
        createImageMetadata("country" -> name),
        fileMetadata(maybeIptcCountryCode = Some(code), maybePhotoshopCountry = Some(name))).country,
      CountryCode.clean(
        createImageMetadata("country" -> name),
        fileMetadata(maybePhotoshopCountry = Some(code), maybeIptcCountryName = Some(name))).country
    )
  }

  def fileMetadata(maybeIptcCountryName: Option[String] = None,
                   maybeIptcCountryCode: Option[String] = None,
                   maybeIptcXmpCountryCode: Option[String] = None,
                   maybePhotoshopCountry: Option[String] = None
                  ): FileMetadata = {
    FileMetadata(
      iptc = List(
        maybeIptcCountryName.map("Country/Primary Location Name" -> _),
        maybeIptcCountryCode.map("Country/Primary Location Code" -> _)
      ).flatten.toMap,
      exif = Map(),
      exifSub = Map(),
      xmp = List(
        maybePhotoshopCountry.map(c => "photoshop:Country" -> JsString(c)),
        maybeIptcXmpCountryCode.map(c => "Iptc4xmpCore:CountryCode" -> JsString(c))
      ).flatten.toMap
    )
  }
}


