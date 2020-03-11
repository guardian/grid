package com.gu.mediaservice.lib.logging

import org.scalatest.{FunSpec, Matchers}

class StopwatchTest extends FunSpec with Matchers {
  it ("should return the elapsed time") {
    val fiveSeconds: Long = 5 * 1000
    def doWork = Thread.sleep(fiveSeconds)

    val stopwatch = Stopwatch.start
    doWork
    stopwatch.elapsed.toMillis should be >= fiveSeconds // >= as time is needed to call the function
  }
}
