package com.gu.mediaservice.model

import play.api.libs.functional.syntax._
import play.api.libs.json._

// TODO: deprecate cost here and infer from category
case class UsageRights(
  category: Option[UsageRightsCategory],
  restrictions: Option[String]
)

// FIXME: Deprecate cost as this will be assumed from the category. This will
// more that likely be done when merging with ImageUsageRights
object UsageRights {
  implicit val UsageRightsReads: Reads[UsageRights] = (
    (__ \ "category").readNullable[UsageRightsCategory]  ~
    (__ \ "restrictions").readNullable[String]
  )(UsageRights.apply _)

  // Annoyingly there doesn't seem to be a way to create a `JsString` with the
  // Json writers, so we have to do this manually
  implicit val UsageRightsWrites: Writes[UsageRights] = (
    (__ \ "category").writeNullable[UsageRightsCategory] ~
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

sealed trait UsageRightsCategory {
  val name = toString.replace("-", " ").split(" ").map(_.capitalize).mkString(" ")
  val description: String
}
object UsageRightsCategory {
  private val usageRightsCategories =
    Vector(Agency, PrImage, Handout, Screengrab, GuardianWitness, SocialMedia, Obituary)

  def fromString(category: String): UsageRightsCategory = {


    // I think as we move forward we can find out what the more intelligent and
    // correct default here. This feels better that reverting to `None` though as
    // it's required by `UsageRights`.
    // TODO: Perhaps we should validate on this?
    usageRightsCategories.find(_.toString == category).getOrElse {
      throw new NoSuchUsageRightsCategory(category)
    }}

    implicit val UsageRightsCategoryReads: Reads[UsageRightsCategory] =
      __.read[String].map(fromString)

    implicit val UsageRightsCategoryWrites: Writes[UsageRightsCategory] =
      Writes[UsageRightsCategory](cat => JsString(cat.toString))
}


// When you add a category, don't forget to add it to `usageRightsCategories`
// TODO: Find a way not to have to do ^
case object Agency
  extends UsageRightsCategory {
    override def toString = "agency"
    val description =
      "Agencies such as Getty, Reuters, Press Association, etc. where " +
      "subscription fees are paid to access and use pictures."
  }

case object PrImage
  extends UsageRightsCategory {
    override def toString = "PR Image"
    val description =
      "Used to promote specific exhibitions, auctions, etc. and only available " +
      "for such purposes."
  }

case object Handout
  extends UsageRightsCategory {
    override def toString = "handout"
    val description =
      "Provided free of use for press purposes e.g. police images for new " +
      "stories, family shots in biographical pieces, etc."
  }

case object Screengrab
  extends UsageRightsCategory {
    override def toString = "screengrab"
    val description =
      "Still images created by us from moving footage in television broadcasts " +
      "usually in relation to breaking news stories."
  }

case object GuardianWitness
  extends UsageRightsCategory {
    override def toString = "guardian-witness"
    val description =
      "Images provided by readers in response to callouts and assignments on " +
      "Guardian Witness."
  }

case object SocialMedia
  extends UsageRightsCategory {
    override def toString = "social-media"
    val description =
      "Images taken from public websites and social media to support " +
      "breaking news where no other image is available from usual sources. " +
      "Permission should be sought from the copyright holder, but in " +
      "extreme circumstances an image may be used with the approval of " +
      "a senior editor."
  }

case object Obituary
  extends UsageRightsCategory {
    override def toString = "obituary"
    val description =
      "Acquired from private sources, e.g. family members, for the purposes of " +
      "obituaries."
  }
