package lib

import com.gu.mediaservice.model.usage.Usage
import play.api.libs.json.{Json, OFormat}

case class ImageUsagesBySupplier(id: String, supplier: String, usages: List[Usage])
object ImageUsagesBySupplier {
  implicit val jsonFormat: OFormat[ImageUsagesBySupplier] = Json.format[ImageUsagesBySupplier]
}

case class ImageUsagesBySupplierResult(images: List[ImageUsagesBySupplier], total: Long)
