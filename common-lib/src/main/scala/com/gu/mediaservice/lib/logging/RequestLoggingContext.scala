package com.gu.mediaservice.lib.logging

import java.util.UUID

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.Principal
import net.logstash.logback.marker.{LogstashMarker, Markers}

import scala.collection.JavaConverters._

case class RequestLoggingContext(
  requestId: UUID = UUID.randomUUID(),
  requestType: String,
  principal: Principal,
  initialMarkers: Map[String, String] = Map.empty
) {
  private val coreMarkers: Map[String, String] = Map(
    "requestId" -> requestId.toString,
    "requestType" -> requestType,
    "authIdentity" -> Authentication.getIdentity(principal),
    "authTier" -> Authentication.getTier(principal).toString
  )

  def toMarker: LogstashMarker = toMarker(Map.empty)

  def toMarker(extraMarkers: Map[String, String]): LogstashMarker = Markers.appendEntries(
    (coreMarkers ++ initialMarkers ++ extraMarkers).asJava
  )
}
