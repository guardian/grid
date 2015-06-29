package com.gu.mediaservice.model

import play.api.libs.json._

import scalaz.ValidationNel
import scalaz.syntax.validation._
import scalaz.syntax.applicative._

// TODO: deprecate cost here and infer from category
case class UsageRights(
  category: Option[UsageRightsCategory],
  restrictions: Option[String] = None,
  photographer: Option[String] = None,
  publication: Option[String] = None
)

object UsageRights {
  implicit val UsageRightsReads: Reads[UsageRights] = Json.reads[UsageRights]
  implicit val UsageRightsWrites: Writes[UsageRights] = Json.writes[UsageRights]

  type UsageRightsValidation = ValidationNel[UsageRightsValidationError, UsageRights]

  def validate(usageRights: UsageRights): UsageRightsValidation = {
    val cleanUsageRights = usageRights.copy(
      restrictions = emptyOptStringToNone(usageRights.restrictions),
      photographer = emptyOptStringToNone(usageRights.restrictions),
      publication = emptyOptStringToNone(usageRights.restrictions)
    )

    (missingRestrictions(cleanUsageRights) |@| missingPhotographer(cleanUsageRights)) apply ((a, b) => b)
  }

  private def missingRestrictions(usageRights: UsageRights): UsageRightsValidation = {
    val cost = UsageRightsCategory.getCost(usageRights.category)
    val missing = cost.contains(Conditional) &&
      usageRights.restrictions.isEmpty &&
      usageRights.category.flatMap(_.defaultRestrictions).isEmpty

    if (missing) {
      UsageRightsValidationError("missing-field", s"${usageRights.category} must have restrictions set").failNel
    } else {
      usageRights.successNel
    }
  }

  private def missingPhotographer(usageRights: UsageRights): UsageRightsValidation = {
    usageRights.category match {
      case Some(StaffPhotographer) if usageRights.photographer.isEmpty =>
        UsageRightsValidationError("missing-field", s"Photographer must have the photographer set").failNel

      case Some(StaffPhotographer) if usageRights.publication.isEmpty =>
        UsageRightsValidationError("missing-field", s"Photographer must have the publication set").failNel

      case _ => usageRights.successNel
    }
  }

  private def emptyOptStringToNone(s: Option[String]) =
    s.map(_.trim).filterNot(_.isEmpty)
}

case class UsageRightsValidationError(key: String, message: String) extends Throwable
