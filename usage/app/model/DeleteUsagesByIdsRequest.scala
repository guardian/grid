package model

import play.api.libs.json.{Json, Reads}

case class DeleteUsagesByIdsRequest(usageIds: List[String])

object DeleteUsagesByIdsRequest {
  implicit val reads: Reads[DeleteUsagesByIdsRequest] = Json.reads[DeleteUsagesByIdsRequest]
}

