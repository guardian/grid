package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.{LogstashMarker, Markers}
import scala.collection.JavaConverters._

trait LoggingMarker {
  def toLogMarker: LogstashMarker

  def toLogMarker(extraMarkers: Map[String, Any]): LogstashMarker = Markers.appendEntries(extraMarkers.asJava)
}
