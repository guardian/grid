package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.lib.config.{RuntimeUsageRightsConfig, UsageRightsConfigProvider}
import com.gu.mediaservice.lib.metadata.UsageRightsMetadataMapper
import com.gu.mediaservice.model._

/**
  * This is largely generic or close to generic processing aside from the Guardian Photographer parser.
  */
class SupplierProcessors(resources: ImageProcessorResources)
  extends ComposeImageProcessors(
    GettyXmpParser,
    AapParser,
    ActionImagesParser,
    AlamyParser,
    ApParser,
    CorbisParser,
    EpaParser,
    PaParser,
    ReutersParser,
    RexParser,
    RonaldGrantParser,
    new PhotographerParser(resources.commonConfiguration.usageRightsConfig),
    AllstarSportsphotoParser,
    AllStarParser,
    UsageRightsToMetadataParser(resources) //This should come after processors that assign usage rights
  )


case class UsageRightsToMetadataParser(resources: ImageProcessorResources) extends ImageProcessor {
  val staffPhotographerPublications: Set[String] = resources.commonConfiguration.usageRightsConfig.staffPhotographers.map(_.name).toSet

  override def apply(image: Image): Image = {
    val maybeNewMetadata = UsageRightsMetadataMapper.usageRightsToMetadata(image.usageRights, image.metadata, staffPhotographerPublications)
    image.copy(
      metadata = image.metadata.copy(
        byline = maybeNewMetadata.flatMap(_.byline) orElse image.metadata.byline,
        credit = maybeNewMetadata.flatMap(_.credit) orElse image.metadata.credit,
        copyright = maybeNewMetadata.flatMap(_.copyright) orElse image.metadata.copyright,
        imageType = maybeNewMetadata.flatMap(_.imageType) orElse image.metadata.imageType
      )
    )
  }

  override def description: String = "Usage Rights to Metadata Parser"
}


/**
  * Guardian specific logic to correctly identify Guardian and Observer photographers and their contracts
  */
class PhotographerParser(photographersConfig: UsageRightsConfigProvider) extends ImageProcessor {
  def apply(image: Image): Image = {
    image.metadata.byline.flatMap { byline =>
      photographersConfig.getPhotographer(byline, image.metadata.dateTaken.getOrElse(image.uploadTime)).map{
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
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("AAPIMAGE") | Some("AAP IMAGE") | Some("AAP") => image.copy(
      usageRights = Agencies.get("aap"),
      metadata    = image.metadata.copy(credit = Some("AAP"))
    )
    case _ => image
  }
}

object ActionImagesParser extends ImageProcessor {

  def extractFixtureID(image:Image) = image.fileMetadata.iptc.get("Fixture Identifier")

  def apply(image: Image): Image = image.metadata.credit match {
    case Some("Action Images") | Some("Action Images/Reuters") | Some("Action images/Reuters") | Some("Action Images/REUTERS") => image.copy(
      usageRights = Agency("Action Images"),
      metadata    = image.metadata.copy(
        credit = Some("Action Images/Reuters"),
        suppliersReference = extractFixtureID(image) orElse image.metadata.suppliersReference
      )
    )
    case _ => image
  }
}

object AlamyParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some(credit) if credit.contains("Alamy") && !credit.contains("Alamy Live News") => image.copy(
      usageRights = Agencies.get("alamy"),
      metadata = image.metadata.copy(credit = Some(credit.replace("Alamy Stock Photo", "Alamy")))
    )
    case _ => image
  }
}

object AllStarParser extends CanonicalisingImageProcessor {
  override def getAgencyName = "Allstar Picture Library"
  override def getCanonicalName: String = "Allstar"

  private val AllstarInSlashDelimitedString = "((.*)/)?(Allstar( Picture Library)?)(/(.*))?".r
  override def getPrefixAndSuffix(s: Option[String]): Option[RegexResult] = {
    s match {
      case Some(AllstarInSlashDelimitedString(_, prefix, _, _, _, suffix)) => Some(RegexResult(toOption(prefix), toOption(suffix)))
      case _ => None
    }
  }
}

object AllstarSportsphotoParser extends CanonicalisingImageProcessor {
  override def getAgencyName = "Allstar Picture Library"
  override def getCanonicalName: String = "Sportsphoto"

  private val SportsphotoInSlashDelimitedString = "((.*)/)?(Sportsphoto( Ltd\\.?)?( Limited)?)(/(.*))?".r
  override def getPrefixAndSuffix(s: Option[String]): Option[RegexResult] = {
    s match {
      case Some(SportsphotoInSlashDelimitedString(_, prefix, _, _, _, _, suffix)) => Some(RegexResult(toOption(prefix), toOption(suffix)))
      case _ => None
    }
  }
}

trait CanonicalisingImageProcessor extends ImageProcessor {
  private val Slash = "/"

  case class RegexResult(prefix: Option[String], suffix: Option[String]) {
    def flat(sep: String, s: String*): Option[String] = (List(prefix, suffix).flatten ++ s) match {
      case Nil => None
      case l => Some(l.mkString(sep))
    }
  }

  def getCanonicalName: String
  lazy val canonicalName = getCanonicalName

  private def matches(image: Image):Boolean = {
    List(image.metadata.byline, image.metadata.credit).flatten.mkString.contains(canonicalName)
  }

  def getPrefixAndSuffix(s:Option[String]): Option[RegexResult]

  lazy val agencyName = getAgencyName

  def getAgencyName: String

  // Rules for slash delimited strings: byline, credit and supplier collection.
  def apply(image: Image): Image = image match {
    case _ if matches(image) => (
      dedupeAndCanonicaliseName _ andThen
      moveCanonicalNameFromBylineToCredit andThen
      removeBylineElementsInCredit andThen
      moveCanonicalNameToEndOfCredit andThen
      setSupplierCollection andThen
      stripDuplicateByline
    )(image)
    case _ => image
  }

  // There should only be one instance of the name
  private def dedupeAndCanonicaliseName(image: Image): Image = {
    image.metadata.credit match {
      case Some(credit) => {
        val creditAcc = credit.split(Slash)
          .foldLeft((List[String](),false))((acc, s) => {
            val (creditList, foundFlag) = acc
            getPrefixAndSuffix(Some(s)) match {
              case Some(_) if !foundFlag => (creditList :+ canonicalName, true)
              case Some(_) => acc
              case None => (creditList :+ s, foundFlag)
            }
          })
          val creditString = creditAcc._1.mkString(Slash)
          image.copy(metadata = image.metadata.copy(credit = Some(creditString)))
      }
      case _ => image
    }
  }

  // Supplier Collection should be credit with 'Canonical Name' removed.
  private def setSupplierCollection(image: Image):Image = getPrefixAndSuffix(image.metadata.credit) match {
    case Some(result) => {
      val supplierCollection = result.flat(Slash)
      image.copy(usageRights = Agency(agencyName, initCap(supplierCollection)))
    }
    case _ => image
  }

  // 'Canonical Name' should always move to the end of credit
  private def moveCanonicalNameToEndOfCredit(image: Image):Image = getPrefixAndSuffix(image.metadata.credit) match {
    case Some(result) => {
      val credit = result.flat(Slash, canonicalName)
      image.copy(metadata = image.metadata.copy(credit = initCap(credit)))
    }
    case _ => image
  }

  // 'Canonical Name' should never be present in the byline (and an empty byline is OK).
  // If it is removed from byline then it should be added to credit if not present.
  def moveCanonicalNameFromBylineToCredit(image: Image) = getPrefixAndSuffix(image.metadata.byline) match {
    case Some(result) => {
      val otherByline = result.flat(Slash)
      image.copy(
        metadata = image.metadata.copy(
          byline = otherByline,
          credit = image.metadata.credit match {
            case None => Some(canonicalName)
            case c@Some(s) => getPrefixAndSuffix(c) match {
              case Some(_) => c
              case _ => Some(s + Slash + canonicalName)
            }
          }
        )
      )
    }
    case _ => image
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

  private def initCap(maybeString:Option[String]): Option[String] = maybeString match {
    case None => None
    case Some(s) => Some(s
      .toLowerCase
      .split(' ').map(_.capitalize).mkString(" ")
      .split('/').map(_.capitalize).mkString(Slash))
  }

  private def removeBylineElementsInCredit(image: Image): Image = (image.metadata.byline, image.metadata.credit) match {
    case (Some(b), Some(c)) => {
      val creditSet = c.split(Slash).toSet
      val newByline = toOption(b.split(Slash).filterNot(s => creditSet.contains(s)).mkString(Slash))
      image.copy(metadata = image.metadata.copy(byline = newByline))
    }
    case _ => image
  }

  def toOption(s: String): Option[String] = Option(s).filterNot(s => s.trim.isEmpty)

}


object ApParser extends ImageProcessor {
  val InvisionFor = "^invision for (.+)".r
  val PersonInvisionAp = "(.+)\\s*/invision/ap$".r

  def getSuppliersReference(image: Image) = {
    image.fileMetadata.readXmpHeadStringProp("plus:ImageSupplierImageID").orElse(image.metadata.suppliersReference)
    // This is also available in a more structured way
    // https://github.com/guardian/grid/pull/3328#issuecomment-849080100
    // But that field is json so let's not.
  }

  def apply(image: Image): Image = image.metadata.credit.map(_.toLowerCase) match {
    case Some("ap") | Some("associated press") => image.copy(
      usageRights = Agency("AP"),
      metadata    = image.metadata.copy(credit = Some("AP"), suppliersReference = getSuppliersReference(image))
    )
    case Some("invision") | Some("invision/ap") |
         Some(InvisionFor(_)) | Some(PersonInvisionAp(_)) => image.copy(
      usageRights = Agency("AP", Some("Invision")),
      metadata = image.metadata.copy(suppliersReference = getSuppliersReference(image))
    )
    case _ => image
  }
}

object CorbisParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.source match {
    case Some("Corbis") => image.copy(
      usageRights = Agency("Corbis")
    )
    case _ => image
  }
}

object EpaParser extends ImageProcessor {
  def getSuppliersReference(image: Image) = {
    image.fileMetadata.iptc.get("Unique Document Identifier").orElse(image.metadata.suppliersReference)
  }
  def apply(image: Image): Image = image.metadata.credit match {
    case Some(x) if x.matches(".*\\bEPA\\b.*") => image.copy(
      usageRights = Agency("EPA"),
      metadata = image.metadata.copy(suppliersReference = getSuppliersReference(image))
    )
    case _ => image
  }
}

object GettyXmpParser extends ImageProcessor {
  def getSuppliersReference(image: Image): Option[String] = {
    // String defined in ImageMetadataConvertor
    image.fileMetadata.getty.get("Asset ID").orElse(image.metadata.suppliersReference)
  }

  val knownGettyCredits = List("AFP", "FilmMagic", "WireImage", "Hulton")
  def getKnownGettyCredit(credit: String): Option[String] =
    knownGettyCredits.find(_.toLowerCase == credit.toLowerCase)

  def hasGettyMetadata(image: Image): Boolean = image.fileMetadata.getty.contains("Asset ID")
  def gettyAgencyWithCollection(suppliersCollection: Option[String]): Agency =
    Agencies
      .getWithCollection("getty", suppliersCollection)

  def apply(image: Image): Image = {
    if (hasGettyMetadata(image)) {
      val collectionField = image.metadata.credit.flatMap(getKnownGettyCredit)
        .orElse(image.metadata.source)
      image.copy(
        usageRights = gettyAgencyWithCollection(collectionField),
        // Set a default "credit" for when Getty is too lazy to provide one
        metadata = image.metadata.copy(
          credit = Some(image.metadata.credit.getOrElse("Getty Images")),
          suppliersReference = getSuppliersReference(image)
        )
      )
    } else {
      image
    }
  }
}

object PaParser extends ImageProcessor {
  val paCredits = List(
    "PA",
    "PA WIRE",
    "PA Wire/PA Images",
    "PA Wire/PA Photos",
    "PA Wire/Press Association Images",
    "PA Archive/PA Photos",
    "PA Archive/PA Images",
    "PA Archive/Press Association Ima",
    "PA Archive/Press Association Images",
    "Press Association Images"
  ).map(_.toLowerCase)

  def apply(image: Image): Image = {
    val isPa = List(image.metadata.credit, image.metadata.source).flatten.exists { creditOrSource =>
      paCredits.contains(creditOrSource.toLowerCase)
    }
    if (isPa) {
      image.copy(
        usageRights = Agency("PA"),
        metadata = image.metadata.copy(
          credit = Some("PA")
        )
      )
    } else image
  }
}

object ReutersParser extends ImageProcessor {

  private val reutersSpellings = """(?i) ?(/ ?)?(via )?(reuters|retuers|reuetrs)/?$""".r

  def extractFixtureID(image:Image) = image.fileMetadata.iptc.get("Fixture Identifier")

  def apply(image: Image): Image = (image.metadata.copyright.map(_.toUpperCase), image.metadata.credit) match {
    // Credit looks like this [byline]-USA TODAY Sports sometimes, so we match on copyright
    case (Some("USA TODAY SPORTS"), _) => image.copy(
      metadata = image.metadata.copy(
        credit = Some("USA Today Sports"),
        suppliersReference = extractFixtureID(image) orElse image.metadata.suppliersReference
      ),
      usageRights = Agency("Reuters")
    )
    case (_, Some(credit)) if credit.toLowerCase.contains("reuters") && credit.toLowerCase.contains("agencja") && (credit.toLowerCase.contains("wyborcza") || credit.toLowerCase.contains("gazeta")) => image.copy(
      metadata = image.metadata.copy(
        credit = Some("Agencja Wyborcza.pl/Reuters"),
        suppliersReference = extractFixtureID(image) orElse image.metadata.suppliersReference
      ),
      usageRights = Agency("Reuters")
    )
    // Reuters and other misspellings
    case (_, Some(credit)) if reutersSpellings.findFirstMatchIn(credit).isDefined && !credit.toLowerCase.contains("action images") =>
      val formattedCredit = List(reutersSpellings.replaceFirstIn(credit, ""), "Reuters")
        .map(_.trim)
        .filter(_.nonEmpty)
        .mkString("/")
      image.copy(
        usageRights = Agency("Reuters"),
        metadata = image.metadata.copy(
          credit = Some(formattedCredit),
          suppliersReference = extractFixtureID(image) orElse image.metadata.suppliersReference
        )
      )
    case _ => image
  }
}

object RexParser extends ImageProcessor {
  val rexAgency = Agencies.get("rex")
  val SlashRex = ".+/ Rex Features".r

  def apply(image: Image): Image = {
    val usageRights: UsageRights =
      if (image.metadata.specialInstructions exists(_.toLowerCase.startsWith("exclusive"))) NoRights
      else rexAgency

    (image.metadata.source, image.metadata.credit) match {
    // TODO: cleanup byline/credit
    case (Some("Rex Features"), _)            => image.copy(usageRights = usageRights)
    case (_, Some(SlashRex()))                => image.copy(usageRights = usageRights)
    case (Some("REX/Shutterstock"), _)        => image.copy(usageRights = usageRights)
    case (Some("Shutterstock"), _)            => image.copy(usageRights = usageRights)
    case (Some("Shutterstock Editorial"), _)  => image.copy(usageRights = usageRights)
    case _ => image
  }
  }
}

object RonaldGrantParser extends ImageProcessor {
  def apply(image: Image): Image = image.metadata.credit match {
    case Some("www.ronaldgrantarchive.com") | Some("Ronald Grant Archive") => image.copy(
      usageRights = Agency("Ronald Grant Archive"),
      metadata    = image.metadata.copy(credit = Some("Ronald Grant"))
    )
    case _ => image
  }
}
