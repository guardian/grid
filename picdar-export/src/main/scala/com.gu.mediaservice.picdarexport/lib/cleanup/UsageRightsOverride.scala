package com.gu.mediaservice.picdarexport.lib.cleanup

import com.gu.mediaservice.lib.config.{MetadataConfig, PhotographersList}
import com.gu.mediaservice.model._

object UsageRightsOverride {

  // scared of typos
  // TODO: centralise
  val theGuardian = "The Guardian"
  val theObserver = "The Observer"
  val weekendMagazine = "Weekend magazine"

  def removeCommissioned(s: String) = s.replace("(commissioned)", "").trim
  def getPublication(s: String) = PhotographersList.getPublication(MetadataConfig.allPhotographers, s).getOrElse(theGuardian)

  def prImage(m: ImageMetadata) = Some(PrImage())
  def guardianWitness(m: ImageMetadata) = Some(GuardianWitness())
  def agency(agency: String) = Some(Agency(agency))

  def commissionedAgency(m: ImageMetadata) =
    m.copyright map(_.toLowerCase) map {
      // I've been through all of these and they all seem to have the correct photographer
      case "commissioned for weekend magazine" => CommissionedPhotographer(m.byline.getOrElse(weekendMagazine), weekendMagazine)
      case "commissioned for the observer"     => CommissionedPhotographer(m.byline.getOrElse(theObserver), theObserver)
      case copyright                           => CommissionedAgency(removeCommissioned(copyright))
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
    case (Some(byline), _)       => Some(ContractPhotographer(byline, getPublication(byline)))
    case (None, Some(copyright)) => Some(ContractPhotographer(copyright, getPublication(copyright)))
    case _ => None
  }

  def commissionedPhotographer(m: ImageMetadata) = (m.byline, m.copyright) match {
    case (Some(byline), _) => Some(CommissionedPhotographer(byline, getPublication(byline)))
    case (None, Some(copyright)) => Some(CommissionedPhotographer(removeCommissioned(copyright), getPublication(removeCommissioned(copyright))))
    case _ => None
  }

  def freeImages(m: ImageMetadata) = {
    m.copyright map(_.toLowerCase) map {
      case "Magnum (commissioned)" => CommissionedAgency("Magnum")

      // ASK Jo (122)
      // case "onEdition" => PrImage()

      case "Publicity image from PR company" => PrImage()
      case "Publicity image from music company" => PrImage()
      case "Publicity image from film company" => PrImage()
      case "Publicity image from TV company" => PrImage()
      case "Publicity image from theatre company" => PrImage()
      case "Publicity image" => PrImage()

      // The caption doesn't always contain anything useful (1042)
      case "See caption - free image" => PrImage(Some("See caption or contact picture desk for usage rights"))

      case "Publicity image from publisher" => PrImage()
      case "Publicity image from opera company" => PrImage()

      // Ask Jo (47)
      case "onEdition - see restrictions" => PrImage()

      // ask Jo if these should have restrictions (50, 4, 34, 115)
      case "NPA Pool" => Pool()
      case "WPA Pool" => Pool()
      case "Pool picture" => Pool()
      case "Rota" => Pool()

      // new Copyright UsageRight? (493)
      // case "Crown Copyright" => PrImage()

      case "Vismedia - free for editorial use" => Handout(Some("Free for editorial use only"))
      case "ODA 2008" => Handout() // Olympic images

      // new Copyright UsageRight? (12)
      // case "MOD Crown Copyright 2010" => PrImage()

      // Ask Jo about restrictions
      case "Paramount Pictures" => PrImage()

      // case "PRnewswire" => PrImage() // this doesn't exist

      // new Copyright UsageRight? (35)
      // case "MoD Pool" => PrImage()

      // case "Publicity image from English Heritage" => PrImage() // this doesn't exist

      // Should these have restrictions (31)
      case "Rota / Pool" => Pool()

      case "Comic Relief" => PrImage()
      case "PR image" => PrImage()
      // case "Supplied to accompany this exhibition ONLY" => PrImage() // this doesn't exist
      case "Publicity image from BA" => PrImage()

      // new Copyright UsageRight? (192)
      // case "MOD" => PrImage()

      // case "Out of copyright" => PrImage() // this doesn't exist

      case "Supplied for obituary" => Obituary()

      // case "Public Domain" => PrImage() // assuming we're leaving this out (27)
      // case "Press office image" => PrImage() // this doesn't exist

      case "Publicity image from architectural company" => PrImage()
      case "Publicity image from charity" => PrImage()

      // ask Jo if these should have restrictions (48)
      case "WPA Rota" => Pool()

      case "The Weinstein Company" => PrImage(Some("Free for editorial use only"))

      case "Publicity image from travel company" => PrImage()
      case "Publicity image for travel" => PrImage()

      case "Greenpeace" => PrImage()
      case "Handout" => Handout()

      case "JOHAN PERSSON" => CommissionedPhotographer("Johan Persson", theGuardian)

      // new Copyright UsageRight? (17)
      // case "UK MoD Crown Copyright 2015" => PrImage()


      case "Andrew Parsons for the Conservative Party" => CommissionedPhotographer("Andrew Parsons", "The Conservative Party")
      // case "Andrew Cowan/Scottish Parliament" => PrImage() / this doesn't exist
      case "SWNS." => CommissionedAgency("SWNS")
      // case "Sergeant Rupert Frere Rlc" => PrImage() // this doesn't exist (and is strange)

      // new Copyright UsageRight? (9)
      case "Crown Copyright. The material may be used for current news purpo" => PrImage()

      case "UIP Press Office" => PrImage(Some("For use in the promotion of the content only.")) // Film etc press release images
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

      "Agencies - contract Rex Features" -> ((m: ImageMetadata) => agency("Rex Features")),
      "Agencies - contract Barcroft Media" -> ((m: ImageMetadata) => agency("Barcroft Media")),
      // there is no consistent collections here, but it doesn't mater as they're all free to use
      // and we only exclude from the collection property
      "Agencies - contract Getty Collections" -> ((m: ImageMetadata) => agency("Getty Images")),
      "Agencies - contract Reuters" -> ((m: ImageMetadata) => agency("Reuters")),
      "Agencies - contract" -> ((m: ImageMetadata) => m.copyright.map(Agency(_))),
      "Agencies - commissioned" -> commissionedAgency,

      "Readers pictures" -> ((m: ImageMetadata) => guardianWitness(m)),
      "Readers' pictures" -> ((m: ImageMetadata) => guardianWitness(m)),

      "Free images - contract" -> freeImages
    )

  def getUsageRights(copyrightGroup: String, metadata: ImageMetadata) =
    copyrightGroupToUsageRightsMap.get(copyrightGroup).flatMap(func => func(metadata))
}
