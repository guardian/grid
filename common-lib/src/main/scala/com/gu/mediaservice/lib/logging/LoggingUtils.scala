package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker

trait LogMarker {
  def toLogMarker: LogstashMarker
}

trait MarkerUtils {
  val FALLBACK: String = "unknown"
  def combineMarkers(markers: LogMarker*): LogstashMarker = markers.map(_.toLogMarker).reduce((first, second) => first.and[LogstashMarker](second))
}
