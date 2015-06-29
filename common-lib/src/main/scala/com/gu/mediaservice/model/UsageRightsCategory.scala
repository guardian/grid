package com.gu.mediaservice.model

import com.gu.mediaservice.lib.config.UsageRightsConfig
import play.api.libs.json._
import play.api.libs.functional.syntax._

sealed trait UsageRightsCategory {
  val name = toString.replace("-", " ").split(" ").map(_.capitalize).mkString(" ")
  val description: String
  val defaultRestrictions: Option[String] = None
}
object UsageRightsCategory {

  def getCost(cat: Option[UsageRightsCategory]): Option[Cost] =
    UsageRightsConfig.categoryCosts.get(cat)

  def getCost(cat: UsageRightsCategory): Option[Cost] =
    getCost(Some(cat))

  private val usageRightsCategories =
    Vector(Agency, PrImage, Handout, Screengrab, GuardianWitness, SocialMedia,
      Obituary, StaffPhotographer)

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

class NoSuchUsageRightsCategory(category: String) extends RuntimeException(s"no such category: $category")

// When you add a category, don't forget to add it to `usageRightsCategories`
// TODO: Find a way not to have to do ^
case object Agency
  extends UsageRightsCategory {
    override def toString = "agency"
    val description =
      "Agencies such as Getty, Reuters, Press Association, etc. where " +
      "subscription fees are paid to access and use ***REMOVED***."
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
      "GuardianWitness."
    override val defaultRestrictions = Some(
      "Contact the GuardianWitness desk before use (witness.editorial@theguardian.com)!"
    )
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

case object StaffPhotographer
  extends UsageRightsCategory {
    override def toString = "staff-photographer"
    val description =
      "Pictures created by photographers who are or were members of staff."
  }




