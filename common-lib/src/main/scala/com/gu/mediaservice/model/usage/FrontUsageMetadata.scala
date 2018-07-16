package com.gu.mediaservice.model

import play.api.libs.json._


case class FrontUsageMetadata(addedBy: String) {

  def toMap = Map("addedBy" -> addedBy)
}
object FrontUsageMetadata {
  implicit val reads: Reads[FrontUsageMetadata] = Json.reads[FrontUsageMetadata]
  implicit val writes: Writes[FrontUsageMetadata] = Json.writes[FrontUsageMetadata]
}
