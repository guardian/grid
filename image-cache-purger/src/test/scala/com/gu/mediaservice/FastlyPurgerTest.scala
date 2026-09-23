package com.gu.mediaservice

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class FastlyPurgerTest extends AnyFunSpec with Matchers {
  describe("FastlyPurger") {
    it("returns a Failure when purging throws an exception") {
      val expectedFailure = new RuntimeException("Unable to load API key")
      val failingApiKeyProvider = new FastlyApiKeyProvider {
        override def apiKey: String = throw expectedFailure
      }

      val result = new FastlyPurger(failingApiKeyProvider, "TEST").purge("image.jpg")

      result.failed.get should be theSameInstanceAs expectedFailure
    }
  }
}

