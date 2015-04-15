package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class UsageRights(
  cost: Cost,
  category: UsageRightsCategory,
  restrictions: String
)

object UsageRights {
  implicit val UsageRightsReads: Reads[UsageRights] = Json.reads[UsageRights]

  // Annoyingly there doesn't seem to be a way to create a `JsString` with the
  // Json writers, so we have to do this manually
  implicit val UsageRightsWrites: Writes[UsageRights] = (
    (__ \ "cost").write[String].contramap(costToString) ~
    (__ \ "category").write[String].contramap(categoryToString) ~
    (__ \ "restrictions").write[String]
  )(unlift(UsageRights.unapply))

  def costToString(c: Cost): String = c.toString
  def categoryToString(c: UsageRightsCategory): String = c.toString
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


sealed trait UsageRightsCategory

object UsageRightsCategory {
  def fromString(string: String): UsageRightsCategory =
    // I think as we move forward we can find out what the more intelligent and
    // correct default here. This feels better that reverting to `None` though as
    // it's required by `UsageRights`.
    // TODO: Perhaps we should validate on this?
    Vector(PrImage).find(_.toString == string).getOrElse(PrImage)

    implicit val UsageRightsCategoryReads: Reads[UsageRightsCategory] =
      __.read[String].map(fromString)
}

case object PrImage
  extends UsageRightsCategory { override def toString = "PR Image" }
