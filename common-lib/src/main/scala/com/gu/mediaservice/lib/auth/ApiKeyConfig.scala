package com.gu.mediaservice.lib.auth
import java.time.Instant
import play.api.libs.json._

case class ApiKeyConfig(
                         schemaVersion: Int,
                         name: String,
                         principalType: String,
                         permissions: List[String],
                         expiresAt: Instant
                       )

object ApiKeyConfig {
  implicit val reads: Reads[ApiKeyConfig] = Json.reads[ApiKeyConfig]
}
