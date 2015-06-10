package com.gu.mediaservice.model

import play.api.libs.functional.syntax._
import play.api.libs.json._

// TODO: deprecate cost here and infer from category
case class UsageRights(
  category: UsageRightsCategory,
  restrictions: Option[String]
)

// FIXME: Deprecate cost as this will be assumed from the category. This will
// more that likely be done when merging with ImageUsageRights
object UsageRights {
  implicit val UsageRightsReads: Reads[UsageRights] = (
    (__ \ "category").read[UsageRightsCategory] ~
    (__ \ "restrictions").readNullable[String]
  )(UsageRights.apply _)

  // Annoyingly there doesn't seem to be a way to create a `JsString` with the
  // Json writers, so we have to do this manually
  implicit val UsageRightsWrites: Writes[UsageRights] = (
    (__ \ "category").write[UsageRightsCategory] ~
    (__ \ "restrictions").writeNullable[String]
  )(unlift(UsageRights.unapply))
}

sealed trait Cost
case object Free
  extends Cost { override def toString = "free" }

case object Conditional
  extends Cost { override def toString = "conditional" }

case object Pay
  extends Cost { override def toString = "pay" }

object Cost {
  def fromString(string: String): Cost =
    Vector(Free, Conditional, Pay).find(_.toString == string).getOrElse(Pay)

  implicit val CostReads: Reads[Cost] = __.read[String].map(fromString)

  implicit val CostWrites: Writes[Cost] = Writes[Cost](c => JsString(c.toString))

}


class NoSuchUsageRightsCategory(category: String) extends RuntimeException(s"no such category: $category")

sealed trait UsageRightsCategory
object UsageRightsCategory {
  private val usageRightsCategories = Vector(Agency, PrImage, Handout, Screengrab)

  def fromString(category: String): UsageRightsCategory =
    // I think as we move forward we can find out what the more intelligent and
    // correct default here. This feels better that reverting to `None` though as
    // it's required by `UsageRights`.
    // TODO: Perhaps we should validate on this?
    usageRightsCategories.find(_.toString == category).getOrElse {
      throw new NoSuchUsageRightsCategory(category)
    }

    implicit val UsageRightsCategoryReads: Reads[UsageRightsCategory] =
      __.read[String].map(fromString)

    implicit val UsageRightsCategoryWrites: Writes[UsageRightsCategory] =
      Writes[UsageRightsCategory](cat => JsString(cat.toString))
}

case object Agency
  extends UsageRightsCategory { override def toString = "agency" }

case object PrImage
  extends UsageRightsCategory { override def toString = "PR Image" }

case object Handout
  extends UsageRightsCategory { override def toString = "handout" }

case object Screengrab
  extends UsageRightsCategory { override def toString = "screengrab" }

case object GuardianWitness
  extends UsageRightsCategory { override def toString = "guardian-witness" }

case object SocialMedia
  extends UsageRightsCategory { override def toString = "social-media" }

case object Obituary
  extends UsageRightsCategory { override def toString = "obituary" }
