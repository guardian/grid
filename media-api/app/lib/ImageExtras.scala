package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._


object ImageExtras {

  val validityDescription = Map(
    "missing_credit"      -> "Missing credit information",
    "missing_description" -> "Missing description",
    "is_png"              -> "PNG images cannot be cropped"
  )

  private def optToBool[T](o: Option[T]): Boolean =
    o.map(_ => true).getOrElse(false)

  def hasCredit(meta: ImageMetadata) = optToBool(meta.credit)
  def hasDescription(meta: ImageMetadata) = optToBool(meta.description)
  def isPng(asset: Asset) = asset.mimeType == Some("image/png")

  def validityMap(image: Image): Map[String, Boolean] = Map(
    "missing_credit"      -> !hasCredit(image.metadata),
    "missing_description" -> !hasDescription(image.metadata),
    "is_png"              -> isPng(image.source)
  )

  def invalidReasons(validityMap: Map[String, Boolean]) = validityMap
    .filter(_._2 == true)
    .map { case (id, _) => id -> validityDescription.get(id) }
    .map {
      case (id, Some(reason)) => id -> reason
      case (id, None) => id -> s"Validity error: ${id}"
    }.toMap

  def isValid(validityMap: Map[String, Boolean]): Boolean =
    !optToBool(validityMap.find(_._2 == true))
}
