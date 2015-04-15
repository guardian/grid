package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class UsageRights(
  cost: Cost,
  // TODO: Not sure if we should have `case object`s representing these as they
  // might change more than, say, `Cost`
  category: String,
  prCategory: Option[String],
  description: String,
  restrictions: String
)

object UsageRights {
  implicit val UsageRightsReads: Reads[UsageRights] = Json.reads[UsageRights]

  // Annoyingly there doesn't seem to be a way to create a `JsString` with the
  // Json writers, so we have to do this manually
  implicit val UsageRightsWrites: Writes[UsageRights] = (
    (__ \ "cost").write[String].contramap(costToString) ~
    (__ \ "category").write[String] ~
    (__ \ "prCategory").writeNullable[String] ~
    (__ \ "description").write[String] ~
    (__ \ "restrictions").write[String]
  )(unlift(UsageRights.unapply))

  def costToString(c: Cost): String = c.toString
}

sealed trait Cost
case object Free
  extends Cost { override def toString = "free" }

case object Conditional
  extends Cost { override def toString = "conditional" }

case object Pay
  extends Cost { override def toString = "pay" }

object Cost {
  // TODO: Find out how to do a Json.writes for a JsString, it appears that Play
  // requires you to write a JsObject, which isn't really helpful in this instance
  def fromString(string: String): Cost =
    Vector(Free, Conditional, Pay).find(_.toString == string).getOrElse(Pay)

  implicit val CostReads: Reads[Cost] = __.read[String].map(fromString)

}
