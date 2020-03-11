package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import play.api.MarkerContext
import scala.language.implicitConversions

import scala.collection.JavaConverters._

trait LogMarker {
  def toLogMarker: LogstashMarker
  def markerContents: Map[String, Any]
}



case class MarkerMap(markerContents: Map[String, Any]) extends LogMarker {
  override def toLogMarker: LogstashMarker = appendEntries(markerContents.asJava)
}

object MarkerMap {
  def apply(entries: (String, Any)*):MarkerMap = MarkerMap(entries.toMap)
}

trait MarkerUtils {
  val FALLBACK: String = "unknown"
  def combineMarkers(markers: LogMarker*): LogMarker = MarkerMap(markers.flatMap(_.markerContents.toSeq).toMap)
  implicit def fromLogMarker(logMarker: LogMarker):MarkerContext = MarkerContext(logMarker.toLogMarker)
}
