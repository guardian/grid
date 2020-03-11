package com.gu.mediaservice.lib.logging

import scala.concurrent.duration._
import net.logstash.logback.marker.{LogstashMarker, Markers}

class Stopwatch {
  private val startedAt = System.nanoTime()

  def elapsed: Duration = (System.nanoTime() - startedAt).nanos

  def elapsedAsMarker: LogstashMarker = Markers.append("duration", elapsed.toMillis)
}

object Stopwatch {
  def start: Stopwatch = new Stopwatch
}
