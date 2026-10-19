package com.gu.mediaservice.lib.imgproxy

import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

import java.net.URI

class ImgProxyUrlBuilderTest extends AnyFunSuiteLike {

  private val baseUri = "https://imgproxy.example.com"
  private val sourceUri = new URI("http://example.com/foo.jpg")

  test("fixedUri uses imgproxy's insecure signature when no signing is provided") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80))

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/rot:0/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri omits the q: segment entirely when quality is None") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 0, height = 0, quality = None)

    uri shouldBe "https://imgproxy.example.com/insecure/w:0/h:0/rot:0/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri signs the request with imgproxy's standard HMAC-SHA256 scheme when signing is provided") {
    val signing = ImgProxySigning(key = "68656c6c6f", salt = "776f726c64")

    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), signing = Some(signing))

    uri shouldBe "https://imgproxy.example.com/Mge4DabQQKgMjq5R6CHlOWBIq3CiuBup2H0nT4khuaY/w:100/h:200/q:80/rot:0/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri falls back to the insecure signature if the key/salt are not valid hex") {
    val signing = ImgProxySigning(key = "not-hex!", salt = "also-not-hex!")

    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), signing = Some(signing))

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/rot:0/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri includes a non-zero rotation") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), rotationDegrees = -90)

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/rot:270/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("templatedUri always uses the insecure signature, since it is expanded client-side after this URL is built") {
    val uri = ImgProxyUrlBuilder.templatedUri(baseUri, sourceUri, rotationDegrees = 0)

    uri shouldBe "https://imgproxy.example.com/insecure/w:{w}/h:{h}/q:{q}/rot:0/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }
}
