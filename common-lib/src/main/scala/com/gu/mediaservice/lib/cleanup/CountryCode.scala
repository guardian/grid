package com.gu.mediaservice.lib.cleanup

import java.util.Locale
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{FileMetadata, Image, ImageMetadata}
import play.api.libs.json.{JsArray, JsString}

/**
  * Cleaner that maps 2/3 letter country codes onto country names
  */
object CountryCode extends ImageProcessor with GridLogging {


  private val codes = {
    case class CountryWithCodes(twoCode: String, threeCode: String, displayName: String)
    val localeCodesAndNames = Locale.getISOCountries.map(twoCode => {
      val locale = new Locale("", twoCode)
      CountryWithCodes(twoCode, locale.getISO3Country, locale.getDisplayName)
    }).toList

    localeCodesAndNames.map(c => c.twoCode -> c.displayName).toMap ++
      localeCodesAndNames.map(c => c.threeCode -> c.displayName).toMap ++
      Map(
        "UK" -> "United Kingdom",
        "GB" -> "United Kingdom",
        "GDR" -> "German Democratic Republic",
        "GRG" -> "Georgia",
        "KOS" -> "Kosovo",
        "POR" -> "Portugal",
        "ROM" -> "Romania",
        "SAR" -> "Saudi Arabia",
        "SER" -> "Serbia",
        "UAE" -> "United Arab Emirates",
        "XKO" -> "Kosovo",
      )
  }

  def findCode(code: String): Option[String] = {
    codes.get(code) match {
      case None => {
        logger.warn(s"Failed to map code to country name: $code")
        None
      }
      case Some(string) => Some(string)
    }

  }

  def getCountryName(countryOrCode: String): Option[String] = countryOrCode match {
    case code if code.length <= 3 => findCode(countryOrCode)
    // longer than 3 letters, just pass through
    // nb, say if we made this 4 to allow USSR then we'd warn on Chad
    // 5 is left as an exercise for the reader
    case _ => None
  }

  def clean(metadata: ImageMetadata, fileMetadata: FileMetadata): ImageMetadata = {
    // These are the locations we check (in order) for the country code.
    val maybeCountries = (List(
      fileMetadata.readXmpHeadStringProp("photoshop:Country"),
      fileMetadata.iptc.get("Country/Primary Location Name"),
      fileMetadata.readXmpHeadStringProp("Iptc4xmpCore:CountryCode"),
      fileMetadata.iptc.get("Country/Primary Location Code")
    )).flatten.flatMap(getCountryName)
    val country = maybeCountries.headOption orElse metadata.country


    metadata.copy(country = country)
  }


  override def apply(image: Image): Image = image.copy(metadata = clean(image.metadata, image.fileMetadata))
}
