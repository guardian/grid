package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._
import lib.usagerights.CostCalculator
import controllers.UsageHelper

object ImageExtras {

  val validityDescription = Map(
    "no_rights"                   -> "No rights to use this image",
    "missing_credit"              -> "Missing credit information",
    "missing_description"         -> "Missing description",
    "paid_image"                  -> "Paid imagery requires a lease",
    "over_quota"                  -> "The quota for this supplier has been exceeded"
  )

  private def optToBool[T](o: Option[T]): Boolean =
    o.map(some => some != false).getOrElse(false)

  def hasRights(rights: UsageRights) = rights match {
    case NoRights => false
    case _ => true
  }
  def hasCredit(meta: ImageMetadata) = optToBool(meta.credit)
  def hasDescription(meta: ImageMetadata) = optToBool(meta.description)

  def hasCurrentAllowLease(leases: LeaseByMedia) = optToBool(leases.current.map(_.access.name == "allow"))
  def hasCurrentDenyLease(leases: LeaseByMedia) = optToBool(leases.current.map(_.access.name == "deny"))

  import scala.concurrent.Await
  import scala.util.Try
  import scala.concurrent.duration._
  import com.gu.mediaservice.lib.FeatureToggle

  def isOverQuota(rights: UsageRights) = Try {Await.result(
    UsageHelper.usageStatusForUsageRights(rights),
    100.millis)
  }.toOption
    .map(_.exceeded)
    .getOrElse(false) && FeatureToggle.get("usage-quota-ui")

  def validityMap(image: Image): Map[String, Boolean] = Map(
    "paid_image"           -> CostCalculator.isPay(image.usageRights),
    "no_rights"            -> !hasRights(image.usageRights),
    "missing_credit"       -> !hasCredit(image.metadata),
    "missing_description"  -> !hasDescription(image.metadata),
    "current_deny_lease"   -> hasCurrentDenyLease(image.leases),
    "over_quota"           -> isOverQuota(image.usageRights)
  )

  def validityOverrides(image: Image): Map[String, Boolean] = Map(
    "current_allow_lease" -> hasCurrentAllowLease(image.leases)
  )

  def invalidReasons(validityMap: Map[String, Boolean]) = validityMap
    .filter(_._2 == true)
    .map { case (id, _) => id -> validityDescription.get(id) }
    .map {
      case (id, Some(reason)) => id -> reason
      case (id, None) => id -> s"Validity error: ${id}"
    }.toMap

  def isValid(validityMap: Map[String, Boolean], validityOverrides: Map[String, Boolean]): Boolean =
    !optToBool(validityMap.find(_._2 == true)) || optToBool(validityOverrides.find(_._2 == true))
}
