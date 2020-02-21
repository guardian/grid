package com.gu.mediaservice.lib.logging

import java.util.UUID

import net.logstash.logback.marker.{LogstashMarker, Markers}

import scala.collection.JavaConverters._

case class RequestLoggingContext(requestId: UUID = UUID.randomUUID(), initialMarkers: Map[String, String] = Map.empty) {
  def toMarker(extraMarkers: Map[String, String] = Map.empty): LogstashMarker = Markers.appendEntries(
    (initialMarkers ++ extraMarkers + ("requestId" -> requestId)).asJava
  )
}
