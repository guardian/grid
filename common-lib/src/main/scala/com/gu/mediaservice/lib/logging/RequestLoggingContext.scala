package com.gu.mediaservice.lib.logging

import java.util.UUID

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import net.logstash.logback.marker.LogstashMarker

case class RequestLoggingContext(
  requestId: UUID = UUID.randomUUID(),
  requestType: String,
  principal: Principal,
  initialMarkers: Map[String, String] = Map.empty
) extends LoggingMarker {
  private val coreMarkers: Map[String, String] = Map(
    "requestId" -> requestId.toString,
    "requestType" -> requestType,
    "authIdentity" -> Authentication.getIdentity(principal),
    "authTier" -> Authentication.getTier(principal).toString
  )

  override def toLogMarker: LogstashMarker = toLogMarker(Map.empty)

  override def toLogMarker(extraMarkers: Map[String, Any]): LogstashMarker = super.toLogMarker(
    coreMarkers ++ initialMarkers ++ extraMarkers
  )
}
