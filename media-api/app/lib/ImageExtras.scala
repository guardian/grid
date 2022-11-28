package lib

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{AllowUseLease, DenyUseLease, LeasesByMedia, MediaLease}
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
    "conditional_paid"            -> "This image is restricted use",
    "current_deny_lease"          -> "Cropping has been denied using a lease",
    "tass_agency_image"           -> "Warning: TASS is Russian state-owned agency, information may not be accurate, including geographical names."
  )

  def validityOverrides(image: Image, withWritePermission: Boolean)(tenantId: Option[String]): Map[String, Boolean] = Map(
    "current_allow_lease" -> hasCurrentAllowLease(image.leases, tenantId = tenantId),
    "has_write_permission" -> withWritePermission
  )

  def hasRights(rights: UsageRights) = !(rights == NoRights)
  def hasCredit(meta: ImageMetadata) = meta.credit.isDefined
  def hasDescription(meta: ImageMetadata) = meta.description.isDefined

  private def isCurrent(lease: MediaLease): Boolean = lease.active && lease.isUse

  def hasCurrentAllowLease(leases: LeasesByMedia, tenantId: Option[String]): Boolean = {
    tenantId match {
      case Some(tenantId) => leases.leases.exists(lease => lease.active && lease.access == AllowUseLease && (lease.appliesToAllTenants || lease.appliesToTenant(tenantId)))
      case None => leases.leases.exists(lease => lease.active && lease.access == AllowUseLease && lease.appliesToAllTenants)
    }
  }

  def hasCurrentDenyLease(leases: LeasesByMedia, tenantId: Option[String]): Boolean = {
    tenantId match {
      case Some(tenantId) =>
        leases.leases.exists(lease => lease.active && lease.access == DenyUseLease && lease.appliesToTenant(tenantId))
      case None =>
        leases.leases.exists(lease => lease.active && lease.access == DenyUseLease && lease.appliesToAllTenants)
    }
  }

  private def validationMap(image: Image, withWritePermission: Boolean, isImageValidation: Boolean)(
    implicit cost: CostCalculator
  ): ValidMap = {

    val shouldOverride = validityOverrides(image, withWritePermission)(cost.tenantId).exists(_._2 == true)

    def createCheck(validCheck: Boolean, overrideable: Boolean = true) =
      ValidityCheck(validCheck, overrideable, shouldOverride)

    val baseValidationMap = Map(
      "paid_image" -> createCheck(cost.isPay(image.usageRights)),
      "conditional_paid" -> createCheck(cost.isConditional(image.usageRights)),
      "no_rights" -> createCheck(!hasRights(image.usageRights)),
      "current_deny_lease" -> createCheck(hasCurrentDenyLease(image.leases, cost.tenantId)),
      "over_quota" -> createCheck(cost.usageQuota.isOverQuota(image.usageRights)),
      "tass_agency_image" -> ValidityCheck(image.metadata.source.exists(_.toUpperCase == "TASS") || image.originalMetadata.byline.contains(
        "ITAR-TASS News Agency"
      ), overrideable = true, shouldOverride = true)
    )
    if (isImageValidation) {
      baseValidationMap ++ Map(
        "missing_credit" -> createCheck(!hasCredit(image.metadata), overrideable = false),
        "missing_description" -> createCheck(!hasDescription(image.metadata), overrideable = false),
      )
    } else {
      baseValidationMap
    }
  }

  def validityMap(image: Image, withWritePermission: Boolean)(implicit cost: CostCalculator): ValidMap = {
    validationMap(image, withWritePermission, isImageValidation = true)
  }

  def downloadableMap(image: Image, withWritePermission: Boolean)(implicit cost: CostCalculator): ValidMap = {
    validationMap(image, withWritePermission, isImageValidation = false)
  }

  def invalidReasons(validityMap: ValidMap, customValidityDesc: Map[String, String] = Map.empty) = validityMap
    .filter { case (_, v) => v.invalid }
    .map { case (id, _) => id -> customValidityDesc.get(id).orElse(validityDescription.get(id)) }
    .map {
      case (id, Some(reason)) => id -> reason
      case (id, None) => id -> s"Validity error: $id"
    }

  def isValid(validityMap: ValidMap): Boolean = validityMap.values.forall(_.isValid)
}
