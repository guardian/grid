package com.gu.mediaservice.lib.logging

import org.scalatest.{FunSpec, Matchers}

class StopwatchTest extends FunSpec with Matchers {
  it("should return the elapsed time") {
    val fiveSeconds: Long = 5 * 1000
    val durationRegex = """\{duration=(\d*)\}""".r

    def doWork = Thread.sleep(fiveSeconds)
    val stopwatch = Stopwatch.start
    doWork

    val marker = stopwatch.elapsed.toLogMarker
    val map = stopwatch.elapsed.markerContents


    map("duration") should be >= fiveSeconds

    (marker.toString match {
      case durationRegex(duration) => {
        duration.toLong
      }
      case _ => 0
    }) should be >= fiveSeconds // >= as time is needed to call the function
  }
}
