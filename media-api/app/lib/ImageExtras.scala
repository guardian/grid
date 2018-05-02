package lib

import com.gu.mediaservice.model._
import lib.usagerights.CostCalculator

case class ValidityCheck(invalid: Boolean, overrideable: Boolean, shouldOverride: Boolean) {
  val isValid: Boolean = !invalid || (overrideable && shouldOverride)
}

object ImageExtras {

  type ValidMap = Map[String, ValidityCheck]

  val validityDescription = Map(
    "no_rights"                   -> "No rights to use this image",
    "missing_credit"              -> "Missing credit information *",
    "missing_description"         -> "Missing description *",
    "paid_image"                  -> "Paid imagery requires a lease",
    "over_quota"                  -> "The quota for this supplier has been exceeded",
    "conditional_paid"            -> "This image is restricted use"
  )

  def validityOverrides(image: Image, withWritePermission: Boolean): Map[String, Boolean] = Map(
    "current_allow_lease" -> hasCurrentAllowLease(image.leases),
    "has_write_permission" -> withWritePermission
  )

  def hasRights(rights: UsageRights) = !(rights == NoRights)
  def hasCredit(meta: ImageMetadata) = meta.credit.isDefined
  def hasDescription(meta: ImageMetadata) = meta.description.isDefined
  def hasCurrentAllowLease(leases: LeaseByMedia) = leases.current.exists(_.access.name == "allow")
  def hasCurrentDenyLease(leases: LeaseByMedia) = leases.current.exists(_.access.name == "deny")

  def validityMap(image: Image, withWritePermission: Boolean)(
    implicit cost: CostCalculator, quotas: UsageQuota): ValidMap = {

    val shouldOverride = validityOverrides(image, withWritePermission).exists(_._2 == true)

    def createCheck(validCheck: Boolean, overrideable: Boolean = true) =
      ValidityCheck(validCheck, overrideable, shouldOverride)

    Map(
      "paid_image"           -> createCheck(cost.isPay(image.usageRights)),
      "conditional_paid"     -> createCheck(cost.isConditional(image.usageRights)),
      "no_rights"            -> createCheck(!hasRights(image.usageRights)),
      "missing_credit"       -> createCheck(!hasCredit(image.metadata), overrideable = false),
      "missing_description"  -> createCheck(!hasDescription(image.metadata), overrideable = false),
      "current_deny_lease"   -> createCheck(hasCurrentDenyLease(image.leases)),
      "over_quota"           -> createCheck(quotas.isOverQuota(image.usageRights))
    )
  }

  def invalidReasons(validityMap: ValidMap) = validityMap
    .filter { case (_, v) => v.invalid }
    .map { case (id, _) => id -> validityDescription.get(id) }
    .map {
      case (id, Some(reason)) => id -> reason
      case (id, None) => id -> s"Validity error: $id"
    }

  def isValid(validityMap: ValidMap): Boolean = validityMap.values.forall(_.isValid)
}
