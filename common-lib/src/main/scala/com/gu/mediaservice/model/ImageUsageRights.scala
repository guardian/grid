package com.gu.mediaservice.model

import play.api.libs.functional.syntax._
import play.api.libs.json._


// TODO: Eventually needs to be unified with UsageRights
case class ImageUsageRights(
  supplier:            Option[String] = None,
  suppliersCollection: Option[String] = None
)


object ImageUsageRights {

  implicit val ImageUsageRightsReads: Reads[ImageUsageRights] = (
    (__ \ "supplier").readNullable[String] ~
      (__ \ "suppliersCollection").readNullable[String]
    )(ImageUsageRights.apply _)

  implicit val ImageUsageRightsWrites: Writes[ImageUsageRights] = (
    (__ \ "supplier").writeNullable[String] ~
      (__ \ "suppliersCollection").writeNullable[String]
    )(unlift(ImageUsageRights.unapply))

}
