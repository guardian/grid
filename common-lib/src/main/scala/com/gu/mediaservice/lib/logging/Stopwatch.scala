package com.gu.mediaservice.lib.logging

import scala.concurrent.duration._
import net.logstash.logback.marker.{LogstashMarker, Markers}
import scala.collection.JavaConverters._

class Stopwatch {
  private val startedAt = System.nanoTime()

  def elapsed: Duration = (System.nanoTime() - startedAt).nanos

  def elapsedAsMarker: LogstashMarker = Markers.appendEntries(Map("duration" -> elapsed.toMillis).asJava)
}

object Stopwatch {
  def start: Stopwatch = new Stopwatch
}
