package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._
import lib.usagerights.CostCalculator


object ImageExtras {

  object Costing extends CostCalculator

  val validityDescription = Map(
    "no_rights"                   -> "No rights to use this image",
    "missing_credit"              -> "Missing credit information *",
    "missing_description"         -> "Missing description *",
    "paid_image"                  -> "Paid imagery requires a lease",
    "over_quota"                  -> "The quota for this supplier has been exceeded",
    "conditional_paid"            -> "This image is restricted use"
  )

  def hasRights(rights: UsageRights) = rights match {
    case NoRights => false
    case _ => true
  }
  def hasCredit(meta: ImageMetadata) = !meta.credit.isEmpty
  def hasDescription(meta: ImageMetadata) = !meta.description.isEmpty

  def hasCurrentAllowLease(leases: LeaseByMedia) =
    leases.current.exists(_.access.name == "allow")
  def hasCurrentDenyLease(leases: LeaseByMedia) =
    leases.current.exists(_.access.name == "deny")

  case class ValidityCheck(valid: Boolean, overrideable: Boolean, shouldOverride: Boolean) {
    val isValid = valid && overrideable && shouldOverride
  }

  def validityMap(image: Image, withWritePermission: Boolean): Map[String, ValidityCheck] = {
    val shouldOverride = validityOverrides(image, withWritePermission).exists(_._2 == true)

    def createCheck(validCheck: Boolean, overrideable: Boolean = true) =
      ValidityCheck(validCheck, overrideable, shouldOverride)

    Map(
      "paid_image"           -> createCheck(Costing.isPay(image.usageRights)),
      "conditional_paid"     -> createCheck(Costing.isConditional(image.usageRights)),
      "no_rights"            -> createCheck(!hasRights(image.usageRights)),
      "missing_credit"       -> createCheck(!hasCredit(image.metadata), false),
      "missing_description"  -> createCheck(!hasDescription(image.metadata), false),
      "current_deny_lease"   -> createCheck(hasCurrentDenyLease(image.leases)),
      "over_quota"           -> createCheck(UsageQuota.isOverQuota(image.usageRights))
    )
  }

  def validityOverrides(image: Image, withWritePermission: Boolean): Map[String, Boolean] = Map(
    "current_allow_lease" -> hasCurrentAllowLease(image.leases),
    "has_write_permission" -> withWritePermission
  )

  def invalidReasons(validityMap: Map[String, ValidityCheck]) = validityMap
    .filter { case (_,v) => v.valid }
    .map { case (id, _) => id -> validityDescription.get(id) }
    .map {
      case (id, Some(reason)) => id -> reason
      case (id, None) => id -> s"Validity error: ${id}"
    }.toMap

  def isValid(validityMap: Map[String, ValidityCheck]): Boolean =
    validityMap.values.forall(_.isValid)
}
