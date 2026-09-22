package com.gu.mediaservice

import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{verify, when}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import java.io.IOException
import java.net.URI
import java.net.http.HttpRequest
import java.time.Duration

class FastlyPurgerTest extends AnyFunSpec with Matchers with MockitoSugar {
  private val imageBaseUrl = URI.create("https://media.test.dev-guim.co.uk")

  describe("HttpFastlyPurger") {
    it("posts an authenticated purge request for the encoded image URL") {
      val transport = mock[HttpTransport]
      when(transport.send(any[HttpRequest])).thenReturn(200)
      val purger = new HttpFastlyPurger(imageBaseUrl, transport)

      purger.purge("folder name/image.jpg", "the-api-key")

      val request = ArgumentCaptor.forClass(classOf[HttpRequest])
      verify(transport).send(request.capture())
      request.getValue.uri().toString shouldBe
        "https://api.fastly.com/purge/https%3A%2F%2Fmedia.test.dev-guim.co.uk%2Ffolder%2520name%2Fimage.jpg"
      request.getValue.method() shouldBe "POST"
      request.getValue.headers().firstValue("Fastly-Key").orElse("") shouldBe "the-api-key"
      request.getValue.headers().firstValue("Accept").orElse("") shouldBe "application/json"
      request.getValue.timeout().orElse(Duration.ZERO) shouldBe Duration.ofSeconds(10)
    }

    it("fails when Fastly returns a non-success status") {
      val transport = mock[HttpTransport]
      when(transport.send(any[HttpRequest])).thenReturn(401)
      val purger = new HttpFastlyPurger(imageBaseUrl, transport)

      val exception = intercept[IOException](purger.purge("image.jpg", "invalid-key"))

      exception.getMessage shouldBe "Fastly purge failed with HTTP status 401"
    }

    it("preserves the interrupted flag when the request is interrupted") {
      val transport = mock[HttpTransport]
      when(transport.send(any[HttpRequest])).thenThrow(new InterruptedException("interrupted"))
      val purger = new HttpFastlyPurger(imageBaseUrl, transport)

      intercept[InterruptedException](purger.purge("image.jpg", "the-api-key"))

      Thread.interrupted() shouldBe true
    }
  }

  describe("FastlyPurger configuration") {
    it("requires the image base URL") {
      var clientCreated = false

      val exception = intercept[IllegalStateException] {
        FastlyPurger.fromEnvironment(Map.empty, {
          clientCreated = true
          java.net.http.HttpClient.newHttpClient()
        })
      }

      exception.getMessage shouldBe "FASTLY_IMAGE_BASE_URL is not set"
      clientCreated shouldBe false
    }

    it("requires an HTTPS image base URL") {
      val exception = intercept[IllegalArgumentException] {
        FastlyPurger.fromEnvironment(
          Map("FASTLY_IMAGE_BASE_URL" -> "http://media.example.com"),
          java.net.http.HttpClient.newHttpClient()
        )
      }

      exception.getMessage shouldBe "requirement failed: FASTLY_IMAGE_BASE_URL must be an HTTPS URL"
    }
  }
}

