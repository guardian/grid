package com.gu.mediaservice.lib.cleanup

import java.util.Locale

import com.gu.mediaservice.lib.Logging
import com.gu.mediaservice.model.ImageMetadata

object CountryCode extends MetadataCleaner with Logging {

  val TwoLetterCode   = """([A-Z]{2})""".r
  val ThreeLetterCode = """([A-Z]{3})""".r

  val allLocales = Locale.getISOCountries.map(new Locale("", _))

  def mapTwoLetterCode(code: String): String = {
    new Locale("", canonicalTwoLetterCode(code)).getDisplayName
  }

  def mapThreeLetterCode(code: String): String = {
    // Rather inefficient O(n) lookup, seemingly no built-in lookup for ISO3 codes
    val matchingLocale = allLocales.find(_.getISO3Country == code)
    matchingLocale.map(_.getDisplayName) getOrElse {
      Logger.warn(s"Failed to map three-letter code to country name: $code")
      code
    }
  }

  def canonicalTwoLetterCode(code: String): String = code match {
    // Map erroneous "UK" code to its correct equivalent
    case "UK" => "GB"
    case c    => c
  }

  override def clean(metadata: ImageMetadata): ImageMetadata = metadata.country match {
    case Some(TwoLetterCode(code))   => metadata.copy(country = Some(mapTwoLetterCode(code)))
    case Some(ThreeLetterCode(code)) => metadata.copy(country = Some(mapThreeLetterCode(code)))
    // No country or not a code, just pass through
    case Some(country) => metadata
    case None          => metadata
  }
}
