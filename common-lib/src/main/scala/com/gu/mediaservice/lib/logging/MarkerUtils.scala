package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import play.api.MarkerContext
import scala.language.implicitConversions
import scala.collection.JavaConverters._

trait LogMarker {
  def toLogMarker: LogstashMarker = appendEntries(markerContents.asJava)

  def markerContents: Map[String, Any]

  def +(marker: (String, Any)): LogMarker = MarkerMap(markerContents + marker)
  def ++(marker: Map[String, Any]): LogMarker = MarkerMap(markerContents ++ marker)
}

case class MarkerMap(markerContents: Map[String, Any]) extends LogMarker

object MarkerMap {
  def apply(entries: (String, Any)*):MarkerMap = MarkerMap(entries.toMap)
}

trait MarkerUtils {
  val FALLBACK: String = "unknown"
  def combineMarkers(markers: LogMarker*): LogMarker = MarkerMap(markers.flatMap(_.markerContents.toSeq).toMap)

  def addLogMarkers(markers: LogMarker*)(implicit marker: LogMarker): LogMarker = combineMarkers(markers :+ marker:_*)

  def addMarkers(markers: (String, Any)*)(implicit marker: LogMarker): LogMarker = {
    combineMarkers(MarkerMap(markers.toMap), marker)
  }

  implicit def fromLogMarker(logMarker: LogMarker):MarkerContext = MarkerContext(logMarker.toLogMarker)
}

