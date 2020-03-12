package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker

object LoggingUtils {
  def combineMarkers(markers: Seq[LogstashMarker]): LogstashMarker = markers.reduce((first, second) => first.and[LogstashMarker](second))
}
