package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._
import lib.usagerights.CostCalculator


object ImageExtras {

  object Costing extends CostCalculator

  val validityDescription = Map(
    "no_rights"                   -> "No rights to use this image",
    "missing_credit"              -> "Missing credit information",
    "missing_description"         -> "Missing description",
    "paid_image"                  -> "Paid imagery requires a lease",
    "over_quota"                  -> "The quota for this supplier has been exceeded",
    "conditional_paid"            -> "This image is restricted use"
  )

  private def optToBool[T](o: Option[T]): Boolean =
    o.map(some => some != false).getOrElse(false)

  def hasRights(rights: UsageRights) = rights match {
    case NoRights => false
    case _ => true
  }
  def hasCredit(meta: ImageMetadata) = optToBool(meta.credit)
  def hasDescription(meta: ImageMetadata) = optToBool(meta.description)

  def hasCurrentAllowLease(leases: LeaseByMedia) =
    optToBool(leases.current.map(_.access.name == "allow"))
  def hasCurrentDenyLease(leases: LeaseByMedia) =
    optToBool(leases.current.map(_.access.name == "deny"))

  import scala.concurrent.Await
  import scala.util.Try
  import scala.concurrent.duration._
  import com.gu.mediaservice.lib.FeatureToggle

  case class ValidityCheck(valid: Boolean, overrideable: Boolean)

  def validityMap(image: Image): Map[String, ValidityCheck] = Map(
    "paid_image"           -> ValidityCheck(Costing.isPay(image.usageRights), false),
    "conditional_paid"     -> ValidityCheck(Costing.isConditional(image.usageRights), false),
    "no_rights"            -> ValidityCheck(!hasRights(image.usageRights), true),
    "missing_credit"       -> ValidityCheck(!hasCredit(image.metadata), true),
    "missing_description"  -> ValidityCheck(!hasDescription(image.metadata), true),
    "current_deny_lease"   -> ValidityCheck(hasCurrentDenyLease(image.leases), true),
    "over_quota"           -> ValidityCheck(UsageQuota.isOverQuota(image.usageRights), true)
  )

  def validityOverrides(image: Image, withWritePermission: Boolean): Map[String, Boolean] = Map(
    "current_allow_lease" -> hasCurrentAllowLease(image.leases),
    "has_write_permission" -> withWritePermission
  )

  def invalidReasons(validityMap: Map[String, ValidityCheck]) = validityMap
    .map{ case (k,v) => k-> v.valid }
    .filter(_._2 == true)
    .map { case (id, _) => id -> validityDescription.get(id) }
    .map {
      case (id, Some(reason)) => id -> reason
      case (id, None) => id -> s"Validity error: ${id}"
    }.toMap

  def naiveIsValid(validityMap: Map[String, ValidityCheck]) =
    !optToBool(validityMap.find(_._2.valid == true))

  def invalidityIsOverridden(
    validityMap: Map[String, ValidityCheck],
    validityOverrides: Map[String, Boolean]
  ): Boolean = {
      optToBool(validityOverrides.find(_._2 == true)) &&
      !optToBool(validityMap.filter(_._2.valid == true)
        .find(_._2.overrideable == false))
  }

  def isValid(validityMap: Map[String, ValidityCheck], validityOverrides: Map[String, Boolean]): Boolean =
    naiveIsValid(validityMap) || invalidityIsOverridden(validityMap, validityOverrides)
}
