package lib

import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.model.usage.Usage
import play.api.libs.json.{Json, OWrites}

case class UsageBySupplier(id: String, supplier: Option[String], usages: List[Usage])
object UsageBySupplier {
  implicit val jsonWrites: OWrites[UsageBySupplier] = Json.writes[UsageBySupplier]

}

object Response {
  implicit val jsonWrites: OWrites[Response] = Json.writes[Response]
}

case class Response(total: Long, images: Seq[UsageBySupplier], list: List[Link])
