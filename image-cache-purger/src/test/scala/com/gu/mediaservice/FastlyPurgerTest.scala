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
    it("builds the service and media-host purge URLs for a key") {
      val purger = new FastlyPurger(apiKeyProvider, "TEST")
      val key = "hash/crop/master/image.jpg"

      purger.purgeUrls(key) shouldBe List(
        s"https://api.fastly.com/service/5CSDV7WcKwnIIHipZzt3po/purge/img/media/$key",
        s"https://api.fastly.com/purge/media.guimcode.co.uk/$key"
      )
    }

    it("returns a Failure when purging throws an exception") {
      val expectedFailure = new RuntimeException("Unable to load API key")
      val failingApiKeyProvider = new FastlyApiKeyProvider {
        override def apiKey: String = throw expectedFailure
      }

      val result = new FastlyPurger(failingApiKeyProvider, "TEST").purge("image.jpg")

      result.failed.get should be theSameInstanceAs expectedFailure
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

