package com.gu.mediaservice.picdarexport.lib.cleanup

import play.api.Logger

import com.gu.mediaservice.lib.config.{UsageRightsConfig, MetadataConfig, PhotographersList}
import com.gu.mediaservice.model._

object UsageRightsOverride {

  import UsageRightsConfig.freeSuppliers

  // scared of typos
  // TODO: centralise
  val theGuardian = "The Guardian"
  val theObserver = "The Observer"
  // Note: not in the list of allowed publications, makes awkward to edit in UI
  val weekendMagazine = "Weekend magazine"

  def removeCommissioned(s: String) = s.replace("(commissioned)", "").trim
  def getPublication(s: String) = {
    val name = extractPhotographer(s)
    PhotographersList.getPublication(MetadataConfig.allPhotographers, name).
      orElse(guessPublication(s)).
      getOrElse(theGuardian)
  }

  val XForThe   = """(.+) for [tT]he .*""".r
  val XSlash    = """(.+) ?/.*""".r
  val WithEmail = """(.+) <.*""".r
  val WithWww   = """(.+) www\..*""".r
  def extractPhotographer(s: String): String = removeCommissioned(s) match {
    case XForThe(name)   => name
    case XSlash(name)    => name
    case WithEmail(name) => name
    case WithWww(name)   => name
    case other           => other
  }

  // This is getting fucking desperate
  val ForTheG = """.* for the g.*""".r
  val ForTheO = """.* for the o.*""".r
  def guessPublication(s: String): Option[String] = s.toLowerCase match {
    case ForTheG() => Some(theGuardian)
    case ForTheO() => Some(theObserver)
    case _ => None
  }

  def prImage(m: ImageMetadata) = Some(PrImage())
  def guardianWitness(m: ImageMetadata) = Some(GuardianWitness())
  def agency(supplier: String, suppliersCollection: Option[String] = None) = supplier match {
    // Only create agency with valid supplier name
    case validSup if freeSuppliers.contains(validSup) => Some(Agency(validSup, suppliersCollection))
    case invalidSup => {
      Logger.warn(s"Don't create agency name with invalid supplier: $invalidSup")
      None
    }
  }

  def guessAgency(copyright: String): Option[Agency] = copyright match {
    case "REUTERS"                  => agency("Reuters")
    case "THE RONALD GRANT ARCHIVE" | "RONALD GRANT"
                                    => agency("Ronald Grant Archive")
    case "Associated Press"         => agency("AP")
    case "PA Archive/Press Association Images" | "PA WIRE" |
         "PA Archive/Press Association Ima" | "Press Association Images" |
         "PA Archive/PA Photos"
                                    => agency("PA")
    case "AFP" | "AFP/Getty Images" => agency("Getty Images", Some("AFP"))
    case "Allsport"                 => agency("Getty Images", Some("Allsport"))
    case "FilmMagic" | "FilmMagic.com"
                                    => agency("Getty Images", Some("FilmMagic"))
    case "BFI"                      => agency("Getty Images", Some("BFI"))
    case "WireImage"                => agency("Getty Images", Some("WireImage"))
    case "Hulton Getty"             => agency("Getty Images", Some("Hulton"))
    case "Tim Graham/Getty Images"  => agency("Getty Images", Some("Tim Graham"))
    case "Man Utd via Getty Images" => agency("Getty Images", Some("Man Utd"))
    case "Allstar"                  => agency("Allstar Picture Library")
    case "Sportsphoto Ltd." | "Sportsphoto Ltd./Allstar" |
         "SPORTSPHOTO LTD" | "ALLSTAR/SPORTSPHOTO"
                                    => agency("Allstar Picture Library", Some("Sportsphoto Ltd."))
    case "Allstar/Cinetext" | "Cine Text / Allstar"
                                    => agency("Allstar Picture Library", Some("Cinetext"))
    // TODO: Keystone, ANSA, dpa - may come from different agency feeds
    case _                          => None
  }

  def commissionedAgency(m: ImageMetadata) =
    m.copyright map(_.toLowerCase) map {
      // I've been through all of these and they all seem to have the correct photographer
      case "commissioned for the guardian"     => CommissionedPhotographer(m.byline.getOrElse(theGuardian), Some(theGuardian))
      case "commissioned for weekend magazine" => CommissionedPhotographer(m.byline.getOrElse(weekendMagazine), Some(weekendMagazine))
      case "commissioned for the observer"     => CommissionedPhotographer(m.byline.getOrElse(theObserver), Some(theObserver))
      case copyright                           => CommissionedAgency(extractPhotographer(copyright))
    }

  def handout(m: ImageMetadata) = Some(Handout())
  def staffPhotographer(m: ImageMetadata) = (m.byline, m.copyright.map(_.toLowerCase)) match {
    case (Some(byline), Some("the observer"))     => Some(StaffPhotographer(byline, theObserver))
    case (Some(byline), Some("guardian"))         => Some(StaffPhotographer(byline, theGuardian))
    case (Some(byline), Some("for the guardian")) => Some(StaffPhotographer(byline, theGuardian))
    case (Some(byline), Some("the guardian"))     => Some(StaffPhotographer(byline, theGuardian))
    case (Some(byline), _)                        => Some(StaffPhotographer(byline, theGuardian))
    case _ => None
  }

  def contractPhotographer(m: ImageMetadata) = (m.byline, m.copyright) match {
    case (Some(byline), _)       => Some(ContractPhotographer(extractPhotographer(byline),    Some(getPublication(byline))))
    case (None, Some(copyright)) => Some(ContractPhotographer(extractPhotographer(copyright), Some(getPublication(copyright))))
    case _ => None
  }

  def commissionedPhotographer(m: ImageMetadata) = (m.byline, m.copyright) match {
    case (Some(byline), _)       => Some(CommissionedPhotographer(extractPhotographer(byline),    Some(getPublication(byline))))
    case (None, Some(copyright)) => Some(CommissionedPhotographer(extractPhotographer(copyright), Some(getPublication(copyright))))
    case _ => None
  }

  def freeImages(m: ImageMetadata) = {
    m.copyright map {
      case "Magnum (commissioned)" => CommissionedAgency("Magnum")


      case "onEdition" => PrImage(Some("See special instructions for restrictions.")) // (122)
      case "onEdition - see restrictions" => PrImage(Some("See special instructions for restrictions.")) // (47)
      // The caption doesn't always contain anything useful (1042)
      case "See caption - free image" => PrImage(Some("See caption or contact picture desk for restrictions."))

      // Think about adding an `pr-industry` property?
      case "Publicity image from PR company" => PrImage()
      case "Publicity image from music company" => PrImage()
      case "Publicity image from film company" => PrImage()
      case "Publicity image from TV company" => PrImage()
      case "Publicity image from theatre company" => PrImage()
      case "Publicity image" => PrImage()
      case "Publicity image from publisher" => PrImage()
      case "Publicity image from opera company" => PrImage()
      case "Publicity image from architectural company" => PrImage()
      case "Publicity image from charity" => PrImage()
      case "Comic Relief" => PrImage()
      case "PR image" => PrImage()
      case "Publicity image from travel company" => PrImage()
      case "Publicity image for travel" => PrImage()
      case "Publicity image from BA" => PrImage()
      case "Press office image" => PrImage()
      // Ask Jo about restrictions
      case "Paramount Pictures" => PrImage()
      case "The Weinstein Company" => PrImage(Some("Free for editorial use only"))

      // ask Jo if these should have restrictions (50, 4, 34, 115, 40, 31)
      case "NPA Pool" => Pool()
      case "WPA Pool" => Pool()
      case "Pool picture" => Pool()
      case "Rota" => Pool()
      case "WPA Rota" => Pool()
      case "Rota / Pool" => Pool()


      case "Vismedia - free for editorial use" => Handout(Some("Free for editorial use only"))
      case "ODA 2008" => Handout() // Olympic images
      case "Handout" => Handout()
      case "Greenpeace" => Handout()

      case "Supplied for obituary" => Obituary()

      case "JOHAN PERSSON" => CommissionedPhotographer("Johan Persson", Some(theGuardian))
      case "Andrew Parsons for the Conservative Party" => CommissionedPhotographer("Andrew Parsons", Some("The Conservative Party"))

      case "SWNS." => CommissionedAgency("SWNS")

      case "UIP Press Office" => PrImage(Some("For use in the promotion of the content only.")) // Film etc press release images

      // new Copyright UsageRight?
      case "MOD" => CrownCopyright() // (192)
      case "UK MoD Crown Copyright 2015" => CrownCopyright() // (17)
      case "Crown Copyright. The material may be used for current news purpo" => CrownCopyright() // (9)
      case "MOD Crown Copyright 2010" => CrownCopyright() // (12)
      case "MoD Pool" => CrownCopyright() // (35)
      case "Crown Copyright" => CrownCopyright() // (493)

      case "Hillsborough Inquests" => Handout()

//       case "Publicity image from English Heritage" => PrImage() // this doesn't exist
//       case "Supplied to accompany this exhibition ONLY" => PrImage() // this doesn't exist
//       case "Out of copyright" => PrImage() // this doesn't exist
//       case "Press office image" => PrImage() // this doesn't exist
//       case "Andrew Cowan/Scottish Parliament" => PrImage() // this doesn't exist
//       case "Sergeant Rupert Frere Rlc" => PrImage() // this doesn't exist (and is strange)
      case "Public Domain" => PrImage() // assuming we're leaving this out (27)
    }
  }

  // TODO: What do we do with Commissioned Agencies
  // e.g. "Copyright Group" == "Agencies - commissioned"
  val copyrightGroupToUsageRightsMap: Map[String, (ImageMetadata) => Option[UsageRights]] =
    Map(
      "Free images" -> handout,
      "TV / film publicity images" -> prImage,
      "TV / film publicity images 2" -> prImage,

      "Guardian / Observer - contract staff" -> staffPhotographer,

      "Freelance photographers - contract" -> contractPhotographer,

      "Freelance photographers - commissioned" -> commissionedPhotographer,
      "Freelance Weekend/Labs photographers - commissioned" -> commissionedPhotographer,

      "Agencies - contract AP Collections" -> ((m: ImageMetadata) => agency("AP")),
      "Agencies - contract Barcroft Media" -> ((m: ImageMetadata) => agency("Barcroft Media")),
      "Agencies - contract Corbis"         -> ((m: ImageMetadata) => agency("Corbis")),
      // there is no consistent collections here, but it doesn't mater as they're all free to use
      // and we only exclude from the collection property
      "Agencies - contract Getty Collections" -> ((m: ImageMetadata) => agency("Getty Images")),
      "Agencies - contract Reuters" -> ((m: ImageMetadata) => agency("Reuters")),
      "Agencies - contract Rex Features" -> ((m: ImageMetadata) => agency("Rex Features")),
      "Agencies - contract" -> ((m: ImageMetadata) => m.copyright.flatMap(copyright => guessAgency(copyright).orElse(agency(copyright)))),
      "Agencies - commissioned" -> commissionedAgency,

      "Readers pictures" -> ((m: ImageMetadata) => guardianWitness(m)),
      "Readers' pictures" -> ((m: ImageMetadata) => guardianWitness(m)),

      "Free images - contract" -> freeImages,

      // Pay-for = No usage rights
      "Agencies - fee" -> ((_: ImageMetadata) => None)
    )

  def getUsageRights(copyrightGroup: String, metadata: ImageMetadata) =
    copyrightGroupToUsageRightsMap.get(copyrightGroup).flatMap(func => func(metadata)) orElse {
      Logger.info(s"Ignoring unmatched copyright group: $copyrightGroup")
      None
    }

  // Picdar rights never have suppliersCollection, so strip it before comparing
  def stripCollection(usageRights: UsageRights) = usageRights match {
    case agency: Agency => agency.copy(suppliersCollection = None)
    case other => other
  }
  def getOverrides(currentRights: UsageRights, picdarRights: UsageRights): Option[UsageRights] = (stripCollection(currentRights), picdarRights) match {
    // Override is the same as current, no override needed
    case (cRights,  pRights) if cRights == pRights => None
    // No current rights, but some overrides, let's use them
    case (NoRights, pRights) => Some(pRights)
    // Existing rights that differ from the override - oops.
    // We kind of trust any ingestion logic (or manual override) more than what we fetched from Picdar.
    // Don't override but log something is fishy
    case (_,        pRights) => {
      Logger.warn(s"Found mismatching current rights and overrides: $currentRights / $picdarRights")
      None
    }
  }
}
