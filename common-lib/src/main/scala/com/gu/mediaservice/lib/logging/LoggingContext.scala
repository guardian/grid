package com.gu.mediaservice.lib.logging

import play.api.MarkerContext
import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers
import scala.collection.JavaConverters._

trait LoggingContext {
  type LogContext = Map[String, String]

  def withContext[T](key: String, value: String)(block: => T): T = {
    val requestMarkers: LogstashMarker = Markers.append(key, value)
    implicit val mc: MarkerContext = MarkerContext(requestMarkers)
    block
  }

  def withContext[T](logContext: LogContext)(block: => T): T = {
    val requestMarkers: LogstashMarker = Markers.appendEntries(logContext.asJava)
    implicit val mc: MarkerContext = MarkerContext(requestMarkers)
    block
  }
}
