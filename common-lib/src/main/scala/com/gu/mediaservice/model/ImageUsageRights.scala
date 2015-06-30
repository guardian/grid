package com.gu.mediaservice.model

import play.api.libs.functional.syntax._
import play.api.libs.json._


// TODO: Eventually needs to be unified with UsageRights
// TODO: All of these are now going to be optional, whereas it should probably
// be optional on the Image level
case class ImageUsageRights(
  category:            Option[UsageRightsCategory] = None,
  supplier:            Option[String] = None,
  suppliersCollection: Option[String] = None,
  restrictions:        Option[String] = None,
  photographer:        Option[String] = None,
  publication:         Option[String] = None
)


object ImageUsageRights {

  implicit val ImageUsageRightsReads: Reads[ImageUsageRights] = Json.reads[ImageUsageRights]

  implicit val ImageUsageRightsWrites: Writes[ImageUsageRights] = (
    (__ \ "category").writeNullable[UsageRightsCategory] ~
      (__ \ "supplier").writeNullable[String] ~
      (__ \ "suppliersCollection").writeNullable[String] ~
      (__ \ "restrictions").writeNullable[String]
    )(unlift(ImageUsageRights.unapply))

}




