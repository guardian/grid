package com.gu.mediaservice.lib.cleanup

import java.text.Normalizer

import com.gu.mediaservice.lib.config.UsageRightsConfigProvider
import com.gu.mediaservice.lib.metadata.UsageRightsMetadataMapper
import com.gu.mediaservice.model._

import scala.util.matching.Regex

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
  val TrailingSlashAp = "(?i)^(.+)/ap$".r
  val TrailingViaAp = "(?i)^(.+)\\s+via ap$".r
  val ApImagesCredit = "(?i)^ap images.*".r
  val BareInvision = "(?i)^invision(\\s+for\\s+.+)?$".r

  /** Normalise a string for fuzzy matching: strip diacritics, lowercase, collapse whitespace/dots */
  def normalise(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD)
      .replaceAll("\\p{M}", "")
      .toLowerCase
      .replaceAll("[.]+", " ")
      .replaceAll("\\s+", " ")
      .trim

  def getSuppliersReference(image: Image) = {
    image.fileMetadata.readXmpHeadStringProp("plus:ImageSupplierImageID").orElse(image.metadata.suppliersReference)
    // This is also available in a more structured way
    // https://github.com/guardian/grid/pull/3328#issuecomment-849080100
    // But that field is json so let's not.
  }

  // Source values that should never become intermediary in Credit
  val sourceIgnoreList: Set[String] = Set(
    "ap", "associated press", "ap files", "aptn", "wire",
    "mlbpv ap", "file", "files", "str",
    "print", "digital camera", "ho", "agoev"
  ).map(normalise)

  // Words stripped from description tokens before matching (e.g. "Kremlin Pool Photo" → "Kremlin")
  val noiseWords: Set[String] = Set("file", "pool", "ap", "photo")

  // FR-pattern sources (e.g. "FR159526 AP", "FR172078") → treat as plain AP (no intermediary)
  val FrSource = "(?i)^FR\\d{1,7}(\\s+AP)?$".r

  // Source rename map: maps raw Source values to the desired display name for Credit.
  // Keys are normalised at creation time for case-insensitive lookup.
  val sourceRenameMap: Map[String, String] = Map(
    "CP" -> "The Canadian Press",
    "DPA" -> "dpa",
    "KEYSTONE" -> "Keystone",
    "Pool Sputnik Kremlin" -> "Sputnik/Kremlin",
    "Pool Sputnik Government" -> "Sputnik/Kremlin",
    "Pool Presidential Press Service" -> "Presidential Press Service",
    "KCNA via KNS" -> "KCNA/KNS",
    "CHINATOPIX" -> "Chinatopix",
    "AAPIMAGE" -> "AAP",
    "AAP Image" -> "AAP",
    "YONHAP" -> "Yonhap",
    "A24 Films" -> "A24",
    "Twentieth Century Fox" -> "20th Century Fox",
    "XINHUA" -> "Xinhua",
    "KYODO NEWS" -> "Kyodo News",
    "PRESSENS BILD" -> "Pressens Bild",
    "TT NEWS AGENCY" -> "TT News Agency",
    "COLOR CHINA PHOTO" -> "Color China Photo",
    "U.S. Central Command" -> "US Central Command",
    "U.S. Navy" -> "US Navy",
    "U.S. Army" -> "US Army",
    "U.S. Air Force" -> "US Air Force",
    "U.S. Geological Survey" -> "US Geological Survey",
    "U.S. Coast Guard" -> "US Coast Guard",
    "U.S. Fish and Wildlife Service" -> "US Fish and Wildlife Service",
    "U.S. Marine Corps" -> "US Marine Corps",
    "NASA" -> "Nasa",
    "NASA TV" -> "Nasa TV",
    "THE DALLAS MORNING NEWS" -> "The Dallas Morning News",
    "BERLINALE" -> "Berlinale",
    "COLUMBIA PICTURES" -> "Columbia Pictures",
    "Disney Plus" -> "Disney+",
    "FOTOPRESS" -> "Fotopress",
    "Getty" -> "Getty Images",
    "Olympic Information Services OIS" -> "OIS/IOC",
    "SHIYO" -> "Yomiuri Shimbun"
  ).map { case (k, v) => normalise(k) -> v }

  /** Strip "Pool" from any position in a source string, cleaning up leftover delimiters */
  private def stripPool(source: String): String =
    source.replaceAll("(?i)\\bpool\\b", "").replaceAll("^[\\s/]+|[\\s/]+$", "").trim

  /** Determine intermediary name from Source field */
  def getIntermediary(source: Option[String]): Option[String] = source.flatMap { src =>
    val srcTrimmed = src.trim
    val srcNorm = normalise(srcTrimmed)

    if (sourceIgnoreList.contains(srcNorm)) None
    else if (FrSource.findFirstMatchIn(srcTrimmed).isDefined) None
    else sourceRenameMap.get(srcNorm) match {
      // Full source found in rename map (handles Sputnik, Presidential Press Service, etc.)
      case Some(renamed) => Some(renamed)
      case None if srcNorm.contains("pool") =>
        // Strip "Pool" from source, use remaining agency as intermediary
        // e.g. "Pool EPA" → "EPA", "AFP Pool" → "AFP", "POOL AP" → "AP" → ignored
        val rest = stripPool(srcTrimmed)
        val restNorm = normalise(rest)
        if (restNorm.isEmpty || sourceIgnoreList.contains(restNorm)) None
        else sourceRenameMap.get(restNorm).orElse(Some(rest))
      case None =>
        // Pass through original casing
        Some(srcTrimmed)
    }
  }

  // Description patterns for AP credit trailers
  val ApPhotoPattern = """(?s)(.*?)\s*\(AP Photo/([^)]+)\)(.*)""".r
  val PhotoByViaApPattern = """(?s)(.*?)\s*\(Photo by ([^)]+?)\s+via AP([^)]*)\)(.*)""".r
  val ViaApPattern = """(?s)(.*?)\s*\(([^)]+?)\s+via AP([^)]*)\)(.*)""".r
  val PhotoByPattern = """(?s)(.*?)\s*\(Photo by ([^)]+)\)(.*)""".r

  /** Extract (before, tokens, after) from a description if it contains a recognised AP credit trailer */
  private def extractTrailer(description: String): Option[(String, String, String)] =
    description match {
      case ApPhotoPattern(before, tokens, after)         => Some((before, tokens, after))
      case PhotoByViaApPattern(before, tokens, _, after) => Some((before, tokens, after))
      case ViaApPattern(before, tokens, _, after)        => Some((before, tokens, after))
      case PhotoByPattern(before, tokens, after)         => Some((before, tokens, after))
      case _ => None
    }

  /** Clean AP description credit trailer after verifying tokens appear in byline/credit */
  def cleanDescription(image: Image, description: String): String =
    extractTrailer(description) match {
      case Some((before, tokens, after)) if descriptionTokensAccountedFor(image, tokens) =>
        (before.trim + " " + after.trim).trim
      case _ => description
    }

  /** Check if all meaningful tokens from a description credit trailer are accounted for in byline/credit fields */
  def descriptionTokensAccountedFor(image: Image, descTokens: String): Boolean = {
    val bylineNorm = image.metadata.byline.map(normalise).getOrElse("")
    val creditNorm = image.metadata.credit.map(normalise).getOrElse("")
    val sourceNorm = image.metadata.source.map(normalise).getOrElse("")
    val intermediaryNorm = getIntermediary(image.metadata.source).map(normalise).getOrElse("")

    // Split by / and , then strip noise words from within each token
    val meaningfulTokens = descTokens.split("[/,]").map(_.trim).filter(_.nonEmpty).map { t =>
      normalise(t).split("\\s+").filterNot(noiseWords.contains).mkString(" ").trim
    }.filter(_.nonEmpty)

    if (meaningfulTokens.isEmpty) true
    else {
      meaningfulTokens.forall { tokenNorm =>
        bylineNorm.contains(tokenNorm) ||
          creditNorm.contains(tokenNorm) ||
          sourceNorm.contains(tokenNorm) ||
          intermediaryNorm.contains(tokenNorm) ||
          // Check if the token is a known alias (via sourceRenameMap) for the intermediary
          // e.g. description says "AAP Image" but intermediary (from Source "AAP") is "AAP"
          sourceRenameMap.get(tokenNorm).exists(renamed => normalise(renamed) == intermediaryNorm)
      }
    }
  }

  def isApCredit(credit: String): Boolean = {
    val lc = credit.toLowerCase.trim
    lc == "ap" || lc == "associated press"
  }

  def isBareInvisionCredit(credit: String): Boolean =
    BareInvision.findFirstMatchIn(credit.trim).isDefined

  def isTrailingApCredit(credit: String): Boolean =
    TrailingSlashAp.findFirstMatchIn(credit.trim).isDefined

  def isViaApCredit(credit: String): Boolean =
    TrailingViaAp.findFirstMatchIn(credit.trim).isDefined

  def isApImagesCredit(credit: String): Boolean =
    ApImagesCredit.findFirstMatchIn(credit.trim).isDefined

  def apply(image: Image): Image = {
    val credit = image.metadata.credit.getOrElse("")

    if (isApCredit(credit) || isTrailingApCredit(credit) || isViaApCredit(credit) || isBareInvisionCredit(credit)) {
      // Core AP image, intermediary/AP, intermediary via AP, or bare Invision
      // Primary: derive intermediary from Source field
      // Fallback: extract from credit pattern (e.g. "NurPhoto/AP" → "NurPhoto", "Invision" → "Invision")
      val sourceIntermediary = getIntermediary(image.metadata.source).filterNot { i =>
        // Don't use Source as intermediary if it's just the photographer's byline
        image.metadata.byline.exists(b => normalise(b) == normalise(i))
      }
      val creditIntermediary = credit.trim match {
        case TrailingSlashAp(before) => Some(before.trim)
        case TrailingViaAp(before)   => Some(before.trim)
        case c if isBareInvisionCredit(c) => Some(c)
        case _ => None
      }
      val intermediary = sourceIntermediary.orElse(creditIntermediary)
      val newCredit = intermediary match {
        case Some(i) => s"$i/AP"
        case None    => "AP"
      }

      // Clean description
      val newDescription = image.metadata.description.map(desc => cleanDescription(image, desc))

      image.copy(
        usageRights = Agency("AP", intermediary),
        metadata = image.metadata.copy(
          credit = Some(newCredit),
          description = newDescription,
          suppliersReference = getSuppliersReference(image)
        )
      )
    } else if (isApImagesCredit(credit)) {
      // AP Images — keep original credit (it's descriptive, e.g. "AP Images for Delta Air Lines")
      val newDescription = image.metadata.description.map(desc => cleanDescription(image, desc))
      image.copy(
        usageRights = Agency("AP", Some("AP Images")),
        metadata = image.metadata.copy(
          description = newDescription,
          suppliersReference = getSuppliersReference(image)
        )
      )
    } else {
      image
    }
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
  private val paCredits = List(
    "PA Wire/PA Images",
    "PA Wire/PA Photos",
    "PA Wire/Press Association Images",
    "PA Archive/PA Photos",
    "PA Archive/PA Images",
    "PA Archive/Press Association Ima",
    "PA Archive/Press Association Images",
    "PA",
    "PA WIRE",
    "PA Archive",
    "Press Association Images",
  )

  private val paCreditRegex = s"(?i)^(?:(.*)/)?(?:${paCredits.mkString("|")})(?:/(.*))?$$".r

  // find any of the above paCredits, extract it from the credit listing, then write "PA" at the end
  private def matchAndClean(maybeMetadataValue: Option[String]): Option[String] = {
    maybeMetadataValue flatMap { metadataValue =>
      paCreditRegex.findFirstMatchIn(metadataValue).map(_.subgroups.filterNot(_ ==  null)) collect {
        case Nil => "PA"
        case List(one) => s"$one/PA"
        case List(before, after) => s"$before/$after/PA"
      }
    }
  }

  def apply(image: Image): Image = {
    val maybeCleanedCredit = matchAndClean(image.metadata.credit).orElse(matchAndClean(image.metadata.source))

    maybeCleanedCredit match {
      case Some(cleanedCredit) => image.copy(
        usageRights = Agency("PA"),
        metadata = image.metadata.copy(credit = Some(cleanedCredit)),
      )
      case None => image
    }
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
    (image.metadata.source, image.metadata.credit) match {
      // TODO: cleanup byline/credit
      case (Some("Rex Features"), _)
        | (_, Some(SlashRex()))
        | (Some("REX/Shutterstock"), _)
        | (Some("Shutterstock"), _)
        | (Some("Shutterstock Editorial"), _) => format(image)
      case _ => image
    }
  }

  private def matchMandatoryCreditBylines(suppliersReference: String) = s"Mandatory Credit: Photo by (.*) \\(${Regex.quote(suppliersReference)}\\)\n"

  private def format(image: Image): Image = {
    val usageRights: UsageRights =
      if (image.metadata.specialInstructions exists(_.toLowerCase.startsWith("exclusive"))) NoRights
      else rexAgency

    def removeSpecialInstructions(description: String) =
      image.metadata.specialInstructions
        .map(specialInstructions => description.replaceAll(s"${Regex.quote(specialInstructions)}\n", ""))
        .getOrElse(description)

    /**
     * Does the image metadata include every byline in the image description's credit line?
     *
     * An example credit line might look like:
     *
     * `Mandatory Credit: Photo by Action Press/Shutterstock (16512200n)`
     *
     * If the image metadata contained
     *
     *  "credit" -> "ITV/Shutterstock"
     *  "byline" -> "Action Press"
     *
     * then this function would return `true`.
     */
    def imageMetadataAccountsForCreditLine(description: String, suppliersReference: String) = {
      val bylinesInMetadata = image.metadata.byline.toList ++ image.metadata.credit.toList.flatMap(_.split("/").toList)

      val maybeBylinesInCreditLine = matchMandatoryCreditBylines(suppliersReference)
        .r
        .findFirstMatchIn(description)
        .flatMap(_.subgroups.headOption)

      maybeBylinesInCreditLine.forall { bylinesInCreditLine =>
          val bylinesWithMetadataRemoved = bylinesInMetadata
            // Remove all the bylines from the credit string
            .foldLeft(bylinesInCreditLine.toLowerCase)((desc, toRemove) => desc.replaceAll(toRemove.toLowerCase, ""))
            // Get rid of whitespace and delimiters
            .replaceAll("[\\s/]", "")

        bylinesWithMetadataRemoved.isEmpty
      }
    }

    def removeCredit(description: String): String =
      image.metadata.suppliersReference match {
        case Some(suppliersReference) if imageMetadataAccountsForCreditLine(description, suppliersReference) =>
          description.replaceAll(matchMandatoryCreditBylines(suppliersReference), "")
        case _ => description
      }

    val description = image.metadata.description
      .map(removeSpecialInstructions)
      .map(removeCredit)

    image.copy(usageRights = usageRights, metadata = image.metadata.copy(description = description))
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
