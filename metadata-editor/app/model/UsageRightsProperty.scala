package model

import play.api.libs.functional.syntax._
import play.api.libs.json._

import com.gu.mediaservice.model._

sealed trait UsageRightsProperty {
  val name: String
  val label: String
  val `type`: String
  val required: Boolean
  val options: Option[List[String]] = None
}

object UsageRightsProperty {
  implicit val jsonWrites: Writes[UsageRightsProperty] = (
    (__ \ "name").write[String] ~
    (__ \ "label").write[String] ~
    (__ \ "type").write[String] ~
    (__ \ "required").write[Boolean] ~
    (__ \ "options").writeNullable[List[String]]
  )(u => (u.name, u.label, u.`type`, u.required, u.options))

  def getPropertiesForCat(u: UsageRights): List[UsageRightsProperty] = {
    photographerProperties(u) ++ restrictionProperties(u)
  }

  private def restrictionProperties(u: UsageRights): List[UsageRightsProperty] = {
    List(RestrictionsProperty(u.defaultCost.contains(Conditional)))
  }

  private def photographerProperties(u: UsageRights): List[UsageRightsProperty] = {
    u match {
      case s: StaffPhotographer => List(PhotographerProperty, PublicationProperty)
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
  // TODO: Configurise
  override val options = Some(List("The Guardian", "The Observer"))
}
