package com.gu.mediaservice.lib.logging

import scala.concurrent.duration._
import net.logstash.logback.marker.{LogstashMarker, Markers}

case class DurationForLogging(duration: Duration) {
  def toMillis: Long = duration.toMillis

  def toLogMarker: LogstashMarker = Markers.append("duration", toMillis)
}

class Stopwatch {
  private val startedAt = System.nanoTime()

  def elapsed: DurationForLogging = DurationForLogging((System.nanoTime() - startedAt).nanos)
}

object Stopwatch {
  def start: Stopwatch = new Stopwatch
}
