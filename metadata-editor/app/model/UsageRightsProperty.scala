package model

import play.api.libs.functional.syntax._
import play.api.libs.json._
import com.gu.mediaservice.lib.config.MetadataConfig.StaffPhotographers


import com.gu.mediaservice.model._


// TODO: We'll be able to deprecate this and build it up directly from case
// classes.
// TODO: turn this into a case class?
sealed trait UsageRightsProperty {
  val name: String
  val label: String
  val `type`: String
  val required: Boolean
  val options: Option[List[String]] = None
  val optionsMap: Option[Map[String, List[String]]] = None
  val optionsMapKey: Option[String] = None
}

object UsageRightsProperty {
  implicit val jsonWrites: Writes[UsageRightsProperty] = (
    (__ \ "name").write[String] ~
    (__ \ "label").write[String] ~
    (__ \ "type").write[String] ~
    (__ \ "required").write[Boolean] ~
    (__ \ "options").writeNullable[List[String]] ~
    (__ \ "optionsMap").writeNullable[Map[String, List[String]]] ~
    (__ \ "optionsMapKey").writeNullable[String]
  )(u => (u.name, u.label, u.`type`, u.required, u.options, u.optionsMap, u.optionsMapKey))

  def getPropertiesForCat(u: UsageRights): List[UsageRightsProperty] = {
    photographerProperties(u) ++ restrictionProperties(u)
  }

  private def restrictionProperties(u: UsageRights): List[UsageRightsProperty] = {
    List(RestrictionsProperty(u.defaultCost.contains(Conditional)))
  }

  private def photographerProperties(u: UsageRights): List[UsageRightsProperty] = {
    u match {
      case s: StaffPhotographer => List(PublicationProperty, PhotographerProperty)
      case _ => List()
    }
  }
}

case class RestrictionsProperty(required: Boolean)
  extends UsageRightsProperty {
  val name = "restrictions"
  val label = "Restrictions"
  val `type` = "text"
}

case object PhotographerProperty
  extends UsageRightsProperty {
  val name = "photographer"
  val label = "Photographer"
  val `type` = "string"
  val required = true
  override val optionsMap = Some(StaffPhotographers.creditBylineMap)
  override val optionsMapKey = Some("publication")
}

case object PublicationProperty
  extends UsageRightsProperty {
  val name = "publication"
  val label = "Publication"
  val `type` = "string"
  val required = true
  override val options = Some(StaffPhotographers.creditBylineMap.keys.toList)
}
