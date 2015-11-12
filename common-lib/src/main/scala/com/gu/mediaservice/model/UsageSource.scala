package com.gu.mediaservice.model

import play.api.libs.json._


case class UsageSource(
  usageType: String,
  uri: Option[String] = None,
  name: Option[String] = None
)
object UsageSource {
  implicit val writes: Writes[UsageSource] = Json.writes[UsageSource]
}
