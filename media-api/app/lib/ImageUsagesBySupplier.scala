package lib

import com.gu.mediaservice.model.{Agency, CommissionedAgency, Composite, UsageRights}
import com.gu.mediaservice.model.usage.Usage
import play.api.libs.json.{Json, OFormat}

case class ImageUsagesBySupplier(id: String, supplier: String, usages: List[Usage])
object ImageUsagesBySupplier {
  def apply(id: String, usageRights: UsageRights, usages: List[Usage]): ImageUsagesBySupplier = {
    val supplier = usageRights match {
      case c: Composite          => c.suppliers
      case a: Agency             => a.supplier
      case ca: CommissionedAgency => ca.supplier
      case u                     => ""
    }
    ImageUsagesBySupplier(id, supplier, usages)
  }
  implicit val jsonFormat: OFormat[ImageUsagesBySupplier] = Json.format[ImageUsagesBySupplier]
}

case class ImageUsagesBySupplierResult(images: List[ImageUsagesBySupplier], total: Long)
