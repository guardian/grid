package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import play.api.MarkerContext
import scala.language.implicitConversions
import org.slf4j.Marker
import net.logstash.logback.marker.Markers
import scala.collection.JavaConverters._

trait LogMarker {
  def toLogMarker: LogstashMarker = appendEntries(markerContents.asJava)

  def markerContents: Map[String, Any]
}
object LogMarker {
  def addMark[T](mark: (String, Any))(implicit mc: MarkerContext): MarkerContext = {
    val newMark: Marker = Markers.appendEntries(
      (Map.empty + mark).asJava
    )
    createNewMarker(newMark, mc)
  }

  def addLogstashMarker[T](newMark: LogstashMarker)(implicit mc: MarkerContext): MarkerContext = {
    createNewMarker(newMark, mc)
  }

  private def createNewMarker[T](newMark: Marker, mc: MarkerContext) = {
    val marker: Marker = mc.marker match {
      case Some(m) => m.add(newMark); m
      case None => newMark
    }
    marker
  }
}

case class MarkerMap(markerContents: Map[String, Any]) extends LogMarker

object MarkerMap {
  def apply(entries: (String, Any)*):MarkerMap = MarkerMap(entries.toMap)
}

trait MarkerUtils {
  val FALLBACK: String = "unknown"
  def combineMarkers(markers: LogMarker*): LogMarker = MarkerMap(markers.flatMap(_.markerContents.toSeq).toMap)
  implicit def fromLogMarker(logMarker: LogMarker):MarkerContext = MarkerContext(logMarker.toLogMarker)
}

