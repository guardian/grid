package com.gu.mediaservice.lib.logging

import org.scalatest.{FunSpec, Matchers}

class StopwatchTest extends FunSpec with Matchers {
  it("should return the elapsed time") {
    val fiveSeconds: Long = 5 * 1000

    def doWork: Unit = Thread.sleep(fiveSeconds)
    val stopwatch = Stopwatch.start
    doWork

    val markers = stopwatch.elapsed.markerContents

    markers.contains("start") shouldBe true
    markers.contains("end") shouldBe true
    markers("duration").toString.toLong should be >= fiveSeconds // >= as time is needed to call the function
  }
}
