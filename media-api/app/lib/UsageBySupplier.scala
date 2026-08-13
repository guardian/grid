package lib

import com.gu.mediaservice.model.usage.Usage
import play.api.libs.json.{Json, OFormat}

case class UsageBySupplier(id: String, supplier: Option[String], usages: List[Usage])
object UsageBySupplier {
  implicit val jsonFormat: OFormat[UsageBySupplier] = Json.format[UsageBySupplier]

}

case class Response(total: Long, images: Seq[UsageBySupplier])

object Response {
  implicit val jsonFormat: OFormat[Response] = Json.format[Response]
}
