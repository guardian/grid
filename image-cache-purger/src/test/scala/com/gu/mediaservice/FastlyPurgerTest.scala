package com.gu.mediaservice

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import java.net.http.{HttpHeaders, HttpRequest, HttpResponse}
import java.util.function.BiPredicate
import scala.jdk.CollectionConverters._

class FastlyPurgerTest extends AnyFunSpec with Matchers with MockitoSugar {
  private val apiKeyProvider = DummyFastlyApiKeyProvider("api-key")

  describe("FastlyPurger") {
    it("returns a Failure when purging throws an exception") {
      val expectedFailure = new RuntimeException("Unable to load API key")
      val failingApiKeyProvider = new FastlyApiKeyProvider {
        override def apiKey: String = throw expectedFailure
      }

      val result = new FastlyPurger(failingApiKeyProvider, "TEST").purge("image.jpg")

      result.failed.get should be theSameInstanceAs expectedFailure
    }

    it("verifies that an image was not served from the previous cache") {
      var capturedRequest: Option[HttpRequest] = None
      val response = responseWithHeaders(Map(
        "X-Cache" -> List("MISS, MISS"),
        "X-Cache-Hits" -> List("0, 0"),
        "Age" -> List("0")
      ))
      val purger = new FastlyPurger(apiKeyProvider, "TEST", request => {
        capturedRequest = Some(request)
        response
      })

      purger.verifyPurge("folder name/image.jpg").isSuccess shouldBe true

      capturedRequest shouldBe defined
      val request = capturedRequest.get
      request.method() shouldBe "GET"
      request.uri().toString shouldBe "https://i.guimcode.co.uk/img/media/folder%20name/image.jpg"
      request.headers().firstValue("Fastly-Debug").orElse("") shouldBe "1"
    }

    it("fails verification when an image was served from an edge or shield cache") {
      val response = responseWithHeaders(Map(
        "X-Cache" -> List("MISS, HIT"),
        "X-Cache-Hits" -> List("0, 1"),
        "Age" -> List("12")
      ))
      val purger = new FastlyPurger(apiKeyProvider, "TEST", _ => response)

      val result = purger.verifyPurge("image.jpg")

      result.isFailure shouldBe true
      result.failed.get.getMessage should include("Fastly purge verification failed")
    }

    it("fails verification when Fastly debug headers are missing") {
      val purger = new FastlyPurger(apiKeyProvider, "TEST", _ => responseWithHeaders(Map.empty))

      purger.verifyPurge("image.jpg").isFailure shouldBe true
    }
  }

  private def responseWithHeaders(values: Map[String, List[String]]): HttpResponse[String] = {
    val response = mock[HttpResponse[String]]
    val headers = HttpHeaders.of(
      values.view.mapValues(_.asJava).toMap.asJava,
      new BiPredicate[String, String] {
        override def test(name: String, value: String): Boolean = true
      }
    )
    org.mockito.Mockito.when(response.headers()).thenReturn(headers)
    response
  }
}

