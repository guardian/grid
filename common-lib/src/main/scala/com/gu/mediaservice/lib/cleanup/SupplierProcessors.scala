package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.lib.config.{MetadataConfig, SupplierMatch, UsageRightsConfig}
import com.gu.mediaservice.model._

trait ImageProcessor {
  def apply(image: Image, supplierCreditMatches: List[SupplierMatch]): Image

  def getMatcher(parserName: String, matches: List[SupplierMatch]): Option[SupplierMatch] =
    matches.find(m => m.name == parserName)

  def matchesCreditOrSource(image: Image, parserName: String, supplierMatches: List[SupplierMatch])=
    getMatcher(parserName, supplierMatches) match {
      case Some(m) => (image.metadata.credit, image.metadata.source) match {
        case (Some(credit), _) if m.creditMatches.map(_.toLowerCase).exists(credit.toLowerCase.matches) => true
        case (_, Some(source)) if m.sourceMatches.map(_.toLowerCase).exists(source.toLowerCase.matches) => true
        case _ => false
      }
      case _ => false
    }
}

class SupplierProcessors(metadataConfig: MetadataConfig) {

  val supplierMap = Map(
    "GettyXmp"    -> GettyXmpParser,
    "GettyCredit" -> GettyCreditParser,
    "Aap"         -> AapParser,
    "ActionImages"-> ActionImagesParser,
    "Alamy"       -> AlamyParser,
    "AllStar"     -> AllStarParser,
    "Ap"          -> ApParser,
    "Barcroft"    -> BarcroftParser,
    "Corbis"      -> CorbisParser,
    "Epa"         -> EpaParser,
    "Pa"          -> PaParser,
    "Reuters"     -> ReutersParser,
    "Rex"         -> RexParser,
    "RonaldGrant" -> RonaldGrantParser,
    "Afp"         -> AfpParser,
    "Photographer"-> new PhotographerParser(metadataConfig)

  )

  def getAll(supplierList: List[String]) =
    supplierList
      .map(supplierMap.get)
      .collect { case Some(processor) => processor }

  def process(image: Image, c: UsageRightsConfig): Image =
    getAll(c.supplierParsers).foldLeft(image) { case (im, processor) => processor(im, c.supplierCreditMatches) }
}

class PhotographerParser(metadataConfig: MetadataConfig) extends ImageProcessor {

  def apply(image: Image, matches: List[SupplierMatch]): Image = apply(image)
  def apply(image: Image): Image = {
    image.metadata.byline.flatMap { byline =>
      metadataConfig.getPhotographer(byline).map {
        case p: StaffPhotographer => image.copy(
          usageRights = p,
          metadata    = image.metadata.copy(credit = Some(p.publication), byline = Some(p.photographer))
        )
        case p: ContractPhotographer => image.copy(
          usageRights = p,
          metadata    = image.metadata.copy(credit = p.publication, byline = Some(p.photographer))
        )
        case _ => image
      }
    }
  }.getOrElse(image)
}

object AapParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "AapParser", matches))
      image.copy(
        usageRights = Agencies.get("aap"),
        metadata    = image.metadata.copy(credit = Some("AAP"))
      )
    else image
}

object ActionImagesParser extends ImageProcessor {

//  def apply(image: Image): Image = image.metadata.credit match {
//    case Some("Action Images") | Some("Action Images/Reuters") => image.copy(
//      usageRights = Agency("Action Images")
//    )
//    case _ => image
//  }

  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "ActionImagesParser", matches))
      image.copy(
        usageRights = Agency("Action Images")
      )
    else image

}

object AlamyParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "AlamyParser", matches))
      image.copy(
        usageRights = Agencies.get("alamy")
      )
    else image
}

object AllStarParser extends ImageProcessor {
  val SlashAllstar = """(.+)/Allstar""".r
  val AllstarSlash = """Allstar/(.+)""".r

  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "AllStarParser", matches))
      withAllstarRights(image)(None)
    else image.metadata.credit match {
      case Some(SlashAllstar(prefix))      => withAllstarRights(image)(Some(prefix))
      case Some(AllstarSlash(suffix))      => withAllstarRights(image)(Some(suffix))
      case _ => image
    }

  def withAllstarRights(image: Image) =
    (asAllstarAgency(image, _: Option[String])) andThen
      stripAllstarFromByline andThen
      stripDuplicateByline

  def asAllstarAgency(image: Image, suppliersCollection: Option[String]) = image.copy(
    usageRights = Agency("Allstar Picture Library", suppliersCollection)
  )

  def stripAllstarFromByline(image: Image) = image.copy(
    metadata = image.metadata.copy(byline = image.metadata.byline.map(stripAllstarSuffix))
  )

  def stripAllstarSuffix(byline: String): String = byline match {
    case SlashAllstar(name) => name
    case _ => byline
  }

  // If suppliersCollection same as byline, remove byline but its byline casing for suppliersCollection and credit,
  // as they otherwise tend to be in ugly uppercase
  def stripDuplicateByline(image: Image) = (image.usageRights, image.metadata.byline) match {
    case (agency @ Agency(supplier, Some(supplColl), _), Some(byline)) if supplColl.toLowerCase == byline.toLowerCase => {
      image.copy(
        usageRights = agency.copy(suppliersCollection = image.metadata.byline),
        metadata = image.metadata.copy(
          credit = image.metadata.credit.map(credit => credit.replace(supplColl, byline)),
          byline = None
        )
      )
    }
    case _ => image
  }

}

object ApParser extends ImageProcessor {
  val InvisionFor = "^invision for (.+)".r
  val PersonInvisionAp = "(.+)\\s*/invision/ap$".r

  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "ApParser", matches))
      image.copy(
        usageRights = Agency("AP"),
        metadata    = image.metadata.copy(credit = Some("AP"))
      )
    else image.metadata.credit.map(_.toLowerCase) match {
      case Some("invision") | Some("invision/ap") |
           Some(InvisionFor(_)) | Some(PersonInvisionAp(_)) => image.copy(
        usageRights = Agency("AP", Some("Invision"))
      )
      case _ => image
    }
}

object BarcroftParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "BarcroftParser", matches))
      image.copy(usageRights = Agency("Barcroft Media"))
    else image
}


object CorbisParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "CorbisParser", matches))
      image.copy(
        usageRights = Agency("Corbis")
      )
    else image
}

object EpaParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "EpaParser", matches))
      image.copy(
        usageRights = Agency("EPA")
      )
    else image
}

trait GettyProcessor {
  def gettyAgencyWithCollection(suppliersCollection: Option[String]) =
    Agencies
      .getWithCollection("getty", suppliersCollection)
}

object GettyXmpParser extends ImageProcessor with GettyProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image = {
    val excludedCredit = List(
      "Replay Images", "newspix international", "i-images", "photoshot", "Ian Jones", "Photo News/Panoramic",
      "Panoramic/Avalon", "Panoramic", "Avalon", "INS News Agency Ltd", "Discovery.", "EPA", "EMPICS", "Empics News",
      "S&G and Barratts/EMPICS Sport", "EMPICS Sport", "EMPICS SPORT", "EMPICS Sports Photo Agency",
      "Empics Sports Photography Ltd.", "EMPICS Entertainment", "Empics Entertainment", "MatchDay Images Limited",
      "S&G and Barratts/EMPICS Archive", "PPAUK", "SWNS.COM", "Euan Cherry", "Plumb Images", "Mercury Press", "SWNS",
      "Athena Pictures", "Flick.digital"
    )

    val excludedSource = List(
      "www.capitalpictures.com", "Replay Images", "UKTV", "PinPep", "Pinnacle Photo Agency Ltd", "News Images",
      "London News Pictures Ltd", "Showtime", "Propaganda", "Equinox Features", "Athena Picture Agency Ltd",
      "www.edinburghelitemedia.co.uk", "WALES NEWS SERVICE", "Sports Inc", "UK Sports Pics Ltd"
    )

    val isExcludedByCredit = image.metadata.credit.exists(isExcluded(_, excludedCredit))
    val isExcludedBySource = image.metadata.source.exists(isExcluded(_, excludedSource))
    val hasGettyMetadata = image.fileMetadata.getty.nonEmpty

    if(!hasGettyMetadata || isExcludedByCredit || isExcludedBySource) {
      image
    } else {
      image.copy(
        usageRights = gettyAgencyWithCollection(image.metadata.source),
        // Set a default "credit" for when Getty is too lazy to provide one
        metadata    = image.metadata.copy(credit = Some(image.metadata.credit.getOrElse("Getty Images")))
      )
    }
  }

  private def isExcluded(value: String, matchers: List[String]): Boolean = {
    matchers.map(_.toLowerCase).exists(value.toLowerCase.contains)
  }
}

object GettyCreditParser extends ImageProcessor with GettyProcessor {
  val gettyCredits = List("AFP", "FilmMagic", "WireImage", "Hulton")

  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "GettyCreditParser", matches))
      image.copy(
        usageRights = gettyAgencyWithCollection(image.metadata.source)
      )
    else image.metadata.credit match {
      case Some(credit) => knownGettyCredits(image, credit)
      case _ => image
    }

  def knownGettyCredits(image: Image, credit: String): Image =
    gettyCredits.find(_.toLowerCase == credit.toLowerCase) match {
      case collection @ Some(_) => image.copy(
        usageRights = gettyAgencyWithCollection(collection)
      )
      case _ => image
    }
}

object PaParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "PaParser", matches))
      image.copy(
        metadata = image.metadata.copy(credit = Some("PA")),
        usageRights = Agency("PA")
      )
    else image
}

object ReutersParser extends ImageProcessor {
//<<<<<<< HEAD
//  def apply(image: Image): Image = image.metadata.credit match {
//    // Reuters and other misspellings
//    // TODO: use case-insensitive matching instead once credit is no longer indexed as case-sensitive
//    case Some("REUTERS") | Some("Reuters") | Some("RETUERS") | Some("REUETRS") | Some("REUTERS/") | Some("via REUTERS") | Some("VIA REUTERS") | Some("via Reuters") => image.copy(
//      usageRights = Agency("Reuters"),
//      metadata = image.metadata.copy(credit = Some("Reuters"))
//    )
//    // Others via Reuters
//    case Some("USA TODAY Sports") => image.copy(
//      metadata = image.metadata.copy(credit = Some("USA Today Sports")),
//      usageRights = Agency("Reuters")
//    )
//    case Some("USA Today Sports") | Some("TT NEWS AGENCY") => image.copy(
//      usageRights = Agency("Reuters")
//    )
//    case _ => image
//  }
//=======
  def apply(image: Image, matches: List[SupplierMatch]): Image =
  // Reuters and other misspellings
  // TODO: use case-insensitive matching instead once credit is no longer indexed as case-sensitive
    if (matchesCreditOrSource(image, "ReutersParser", matches))
      image.copy(
        usageRights = Agency("Reuters"),
        metadata = image.metadata.copy(credit = Some("Reuters"))
      )
    else image.metadata.credit match {
      // Others via Reuters
      case Some("USA TODAY Sports") => image.copy(
        metadata = image.metadata.copy(credit = Some("USA Today Sports")),
        usageRights = Agency("Reuters")
      )
      case Some("USA Today Sports") | Some("TT NEWS AGENCY") => image.copy(
        usageRights = Agency("Reuters")
      )
      case _ => image
    }
}

object RexParser extends ImageProcessor {
  val rexAgency = Agencies.get("rex")
  val SlashRex = ".+/ Rex Features".r

  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "RexParser", matches))
      image.copy(usageRights = rexAgency)
    else image
}

object RonaldGrantParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "RonaldGrantParser", matches))
      image.copy(
        usageRights = Agency("Ronald Grant Archive"),
        metadata = image.metadata.copy(credit = Some("Ronald Grant"))
      )
    else image
}

object AfpParser extends ImageProcessor {
  def apply(image: Image, matches: List[SupplierMatch]): Image =
    if (matchesCreditOrSource(image, "AfpParser", matches))
      image.copy(
        usageRights = Agency("AFP"),
      )
    else image
}
