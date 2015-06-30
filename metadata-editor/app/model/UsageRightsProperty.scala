package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

import com.gu.mediaservice.model.{StaffPhotographer, Conditional, UsageRightsCategory}

sealed trait UsageRightsProperty {
  val name: String
  val label: String
  val `type`: String
  val required: Boolean
}

object UsageRightsProperty {
  implicit val jsonWrites: Writes[UsageRightsProperty] = (
    (__ \ "name").write[String] ~
    (__ \ "label").write[String] ~
    (__ \ "type").write[String] ~
    (__ \ "required").write[Boolean]
  )(u => (u.name, u.label, u.`type`, u.required))

  def getPropertiesForCat(cat: UsageRightsCategory): List[UsageRightsProperty] = {
    photographerProperties(cat) ++ restrictionProperties(cat)
  }

  private def restrictionProperties(cat: UsageRightsCategory): List[UsageRightsProperty] = {
    // we use `Some` here as everything, for now, can have restriction
    // when we move to having a "No Rights" category, this will change
    List(RestrictionsProperty(UsageRightsCategory.getCost(cat).contains(Conditional)))
  }

  private def photographerProperties(cat: UsageRightsCategory): List[UsageRightsProperty] = {
    cat match {
      case StaffPhotographer => List(PhotographerProperty, PublicationProperty)
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
}

case object PublicationProperty
  extends UsageRightsProperty {
  val name = "publication"
  val label = "Publication"
  val `type` = "string"
  val required = true
}
