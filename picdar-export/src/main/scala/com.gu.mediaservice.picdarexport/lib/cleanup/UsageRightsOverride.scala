package com.gu.mediaservice.picdarexport.lib.cleanup

import com.gu.mediaservice.lib.config.{MetadataConfig, PhotographersList}
import com.gu.mediaservice.model._

object UsageRightsOverride {

  // scared of typos
  val theGuardian = "The Guardian"
  val theObserver = "The Guardian"

  def removeCommissioned(s: String) = s.replace("(commissioned)", "").trim
  def getPublication(s: String) = PhotographersList.getPublication(MetadataConfig.allPhotographers, s).getOrElse(theGuardian)

  def prImage(m: ImageMetadata) = Some(PrImage())
  def guardianWitness(m: ImageMetadata) = Some(GuardianWitness())
  def agency(agency: String) = Some(Agency(agency))

  def handout(m: ImageMetadata) = Some(Handout())
  def staffPhotographer(m: ImageMetadata) = (m.byline, m.copyright.map(_.toLowerCase)) match {
    case (Some(byline), Some("the observer"))     => Some(StaffPhotographer(byline, "The Observer"))
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

  def commissionedPhotographer(m: ImageMetadata) =(m.byline, m.copyright) match {
    case (Some(byline), _) => Some(CommissionedPhotographer(byline, getPublication(byline)))
    case (None, Some(copyright)) => Some(CommissionedPhotographer(removeCommissioned(copyright), getPublication(removeCommissioned(copyright))))
    case _ => None
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

      "Readers pictures" -> ((m: ImageMetadata) => guardianWitness(m))),
      "Readers' pictures" -> ((m: ImageMetadata) => guardianWitness(m))
    )

  def getUsageRights(copyrightGroup: String, metadata: ImageMetadata) =
    copyrightGroupToUsageRightsMap.get(copyrightGroup).flatMap(func => func(metadata))
}
