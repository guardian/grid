package model

import play.api.libs.json._
import play.api.libs.functional.syntax._

case class UsageRight(
  cost: Cost,
  // TODO: Not sure if we should have `case object`s representing these as they
  // might change more than, say, `Cost`
  category: String,
  description: String,
  restriction: String,
  prType: Option[String]
)

object UsageRight {
  implicit val UsageRightReads: Reads[UsageRight] = Json.reads[UsageRight]

  // Annoyingly there doesn't seem to be a way to create a `JsString` with the
  // Json writers, so we have to do this manually
  implicit val UsageRightWrites: Writes[UsageRight] = (
    (__ \ "cost").write[String].contramap(costToString) ~
    (__ \ "category").write[String] ~
    (__ \ "description").write[String] ~
    (__ \ "restriction").write[String] ~
    (__ \ "prType").writeNullable[String]
  )(unlift(UsageRight.unapply))

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
