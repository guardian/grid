package lib

import com.gu.mediaservice.model.{Agency, CommissionedAgency, Composite, Image, UsageRights}
import com.gu.mediaservice.model.usage.Usage
import play.api.libs.json.{Json, OFormat}

case class UsageReportingImageOriginalMetadata(
  byline: Option[String],
  suppliersReference: Option[String],
  description: Option[String],
  iptc: Map[String, String],
  getty: Map[String, String]
)
object UsageReportingImageOriginalMetadata {
  private val IptcKeys = Set("Copyright Notice", "Credit")
  private val GettyKeys = Set("Asset ID", "Original Filename")

  def apply(image: Image): UsageReportingImageOriginalMetadata = UsageReportingImageOriginalMetadata(
    byline = image.originalMetadata.byline,
    suppliersReference = image.originalMetadata.suppliersReference,
    description = image.originalMetadata.description,
    iptc = image.fileMetadata.iptc.filter { case (key, _) => IptcKeys.contains(key) },
    getty = image.fileMetadata.getty.filter { case (key, _) => GettyKeys.contains(key) }
  )

  implicit val jsonFormat: OFormat[UsageReportingImageOriginalMetadata] = Json.format[UsageReportingImageOriginalMetadata]
}

case class ImageUsagesBySupplier(
  id: String,
  supplier: String,
  usages: List[Usage],
  originalMetadata: UsageReportingImageOriginalMetadata,
  identifiers: Map[String, String]
)
object ImageUsagesBySupplier {
  val IdentifierKeys = Set("picdarurn")

  def apply(image: Image, usages: List[Usage]): ImageUsagesBySupplier = {
    val supplier = image.usageRights match {
      case c: Composite          => c.suppliers
      case a: Agency             => a.supplier
      case ca: CommissionedAgency => ca.supplier
      case u                     => ""
    }
    ImageUsagesBySupplier(
      id = image.id,
      supplier = supplier,
      usages = usages,
      originalMetadata = UsageReportingImageOriginalMetadata(image),
      identifiers = image.identifiers.filter { case (key, _) => IdentifierKeys.contains(key) }
    )
  }
  implicit val jsonFormat: OFormat[ImageUsagesBySupplier] = Json.format[ImageUsagesBySupplier]
}

case class ImageUsagesBySupplierResult(images: List[ImageUsagesBySupplier], total: Long)
