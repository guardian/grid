package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._


object ImageExtras {

  val validityDescription = Map(
    "no_rights"                   -> "No rights to use this image",
    "missing_credit"              -> "Missing credit information",
    "missing_description"         -> "Missing description"
  )

  private def optToBool[T](o: Option[T]): Boolean =
    o.map(s => s != false).getOrElse(false)

  def hasRights(rights: UsageRights) = rights match {
    case NoRights => false
    case _ => true
  }
  def hasCredit(meta: ImageMetadata) = optToBool(meta.credit)
  def hasDescription(meta: ImageMetadata) = optToBool(meta.description)

  def hasCurrentAllowLease(leases: LeaseByMedia) = optToBool(leases.current.map(_.access.name == "allow"))
  def hasCurrentDenyLease(leases: LeaseByMedia) = optToBool(leases.current.map(_.access.name == "deny"))

  def validityMap(image: Image): Map[String, Boolean] = Map(
    "no_rights"            -> !hasRights(image.usageRights),
    "missing_credit"       -> !hasCredit(image.metadata),
    "missing_description"  -> !hasDescription(image.metadata),
    "current_deny_lease"   -> hasCurrentDenyLease(image.leases)
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
