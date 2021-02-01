package com.gu.mediaservice.lib.cleanup

import java.util.Locale

import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.ImageMetadata

/**
  * Cleaner that maps 2/3 letter country codes onto country names
  */
object CountryCode extends GridLogging {

  case class CountryWithCodes(twoCode: String, threeCode: String, displayName: String)
  val TwoLetterCode   = """([A-Z]{2})""".r
  val ThreeLetterCode = """([A-Z]{3})""".r

  val allLocales = Locale.getISOCountries.map(new Locale("", _))

  val codes = Locale.getISOCountries.map(twoCode => {
    val locale = new Locale("",twoCode)
    CountryWithCodes(twoCode, locale.getISO3Country, locale.getDisplayName)
  }).toList

  val twoCodes = codes.map(c => c.twoCode -> c.displayName).toMap ++ Map("UK"->"United Kingdom", "GB" -> "United Kingdom")
  val threeCodes = codes.map(c => c.threeCode -> c.displayName).toMap

  def mapTwoLetterCode(code: String): Option[String] = {
     twoCodes.get(code) match {
       case None => {      logger.warn(s"Failed to map two-letter code to country name: $code")
None
      }
      case Some(string) => Some(string)
     }

  }

  def mapThreeLetterCode(code: String): Option[String] = {
    threeCodes.get(code) match {
      case None => {
        logger.warn(s"Failed to map three-letter code to country name: $code")
        None
      }
      case Some(country) => Some(country)
    }
  }

  def getCountryName(countryOrCode: String): Option[String] = countryOrCode match {
    case TwoLetterCode(countryOrCode)   => mapTwoLetterCode(countryOrCode)
    case ThreeLetterCode(countryOrCode) => mapThreeLetterCode(countryOrCode)
    // No country or not a code, just pass through
    case _ => None
  }
}
