package com.gu.mediaservice.lib.logging

import java.time.ZonedDateTime

import com.gu.mediaservice.lib.DateTimeUtils

import scala.concurrent.duration._

case class DurationForLogging(startTime: ZonedDateTime, duration: Duration) extends LogMarker {
  def toMillis: Long = duration.toMillis

  override def markerContents = Map(
    "start" -> DateTimeUtils.toString(startTime),
    "end" -> DateTimeUtils.toString(DateTimeUtils.now()),
    "duration" -> toMillis
  )
}

class Stopwatch {
  // This method can only be used to measure elapsed time and is not related to any other notion of system or wall-clock time.
  // Therefore we additionally have `startTime` to track the time.
  // see https://docs.oracle.com/javase/9/docs/api/java/lang/System.html#nanoTime--
  private val startedAt = System.nanoTime()

  private val startTime = DateTimeUtils.now()

  def elapsed: DurationForLogging = DurationForLogging(startTime, (System.nanoTime() - startedAt).nanos)
}

object Stopwatch {
  def start: Stopwatch = new Stopwatch
}
