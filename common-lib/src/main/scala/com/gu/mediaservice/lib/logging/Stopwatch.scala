package com.gu.mediaservice.lib.logging

import net.logstash.logback.marker.LogstashMarker
import play.api.Logger

import scala.concurrent.duration._

case class DurationForLogging(duration: Duration) extends LogMarker {
  def toMillis: Long = duration.toMillis
  def markerContents: Map[String, Long] = Map("duration" -> toMillis)
}

class Stopwatch  {
  private val startedAt = System.nanoTime()

  def elapsed: DurationForLogging = DurationForLogging((System.nanoTime() - startedAt).nanos)
}

object Stopwatch {
  def start: Stopwatch = new Stopwatch

  def apply[T](label: String)(body: => T)(implicit requestContext: RequestLoggingContext): T = {
    val stopwatch = new Stopwatch
    try {
      val result = body
      implicit val markerContext: LogstashMarker =
        RequestLoggingContext(initialMarkers = requestContext.initialMarkers + ("duration" -> stopwatch.elapsed.toString)).toMarker()
      Logger.info(s"Stopwatch: $label ${stopwatch.elapsed} ns")
      result
    } catch {
      case e: Exception => Logger.error(s"Stopwatch: $label ${stopwatch.elapsed} ns", e); throw e
    }
  }
}

