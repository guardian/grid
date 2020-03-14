package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import scala.collection.JavaConverters._

trait LogMarker { def toLogMarker: LogstashMarker }

case class MarkerMap(values: Map[String, Any]) extends LogMarker {
  override def toLogMarker: LogstashMarker = appendEntries(values.asJava)
}

trait MarkerUtils {
  val FALLBACK: String = "unknown"
  def combineMarkers(markers: LogMarker*): LogstashMarker = markers.map(_.toLogMarker).reduce((first, second) => first.and[LogstashMarker](second))
}
