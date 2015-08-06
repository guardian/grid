package com.gu.mediaservice.picdarexport.lib.cleanup

import com.gu.mediaservice.lib.config.{MetadataConfig, PhotographersList}
import com.gu.mediaservice.model._

object UsageRightsOverride {

  def removeCommissioned(s: String) = s.replace("(commissioned)", "").trim
  def getPublication(s: String) = PhotographersList.getPublication(MetadataConfig.allPhotographers, s).getOrElse("The Guardian")

  def handout(m: ImageMetadata) = Handout()
  def staffPhotographer(m: ImageMetadata) = StaffPhotographer(m.byline.get, m.copyright.get.toLowerCase match {
    // we know these are the only values
    case "the observer" => "The Observer"
    case "guardian" => "The Guardian"
    case "for the guardian" => "The Guardian"
    case "the guardian" => "The Guardian"
    case _ => "The Guardian"
  })

  def contractPhotographer(m: ImageMetadata) =
    ContractPhotographer(removeCommissioned(m.copyright.get), getPublication(m.copyright.get))
  def commissionedPhotographer(m: ImageMetadata) =
    CommissionedPhotographer(removeCommissioned(m.copyright.get), getPublication(m.copyright.get))

  // TODO: What do we do with Commissioned Agencies
  // e.g. "Copyright Group" == "Agencies - commissioned"
  val copyrightGroupToUsageRightsMap: Map[String, (ImageMetadata) => UsageRights] =
    Map(
      "Free images" -> handout,
      "TV / film publicity images" -> handout,
      "TV / film publicity images 2" -> handout,

      "Guardian / Observer - contract staff" -> staffPhotographer,

      "Freelance photographers - contract" -> contractPhotographer,

      "Freelance photographers - commissioned" -> commissionedPhotographer,
      "Freelance Weekend/Labs photographers - commissioned" -> commissionedPhotographer,

      "Agencies - contract Rex Features" -> ((m: ImageMetadata) => Agency("Rex Features")),
      "Agencies - contract Barcroft Media" -> ((m: ImageMetadata) => Agency("Barcroft Media")),
      // there is no consistent collections here, but it doesn't mater as they're all free to use
      // and we only exclude from the collection property
      "Agencies - contract Getty Collections" -> ((m: ImageMetadata) => Agency("Getty Images")),
      "Agencies - contract Reuters" -> ((m: ImageMetadata) => Agency("Reuters")),
      "Agencies - contract" -> ((m: ImageMetadata) => Agency(m.copyright.get)),

      "Readers pictures" -> ((m: ImageMetadata) => GuardianWitness()),
      "Readers' pictures" -> ((m: ImageMetadata) => GuardianWitness())
    )

  def getUsageRights(copyrightGroup: String, metadata: ImageMetadata) =
    copyrightGroupToUsageRightsMap.get(copyrightGroup).map(func => func(metadata))
}
