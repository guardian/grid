package com.gu.mediaservice.lib.imgproxy

import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

import java.net.URI

class ImgProxyUrlBuilderTest extends AnyFunSuiteLike {

  private val baseUri = "https://imgproxy.example.com"
  private val sourceUri = new URI("http://example.com/foo.jpg")

  test("fixedUri uses imgproxy's insecure signature when no signing is provided") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80))

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri omits the q: segment entirely when quality is None") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 0, height = 0, quality = None)

    uri shouldBe "https://imgproxy.example.com/insecure/w:0/h:0/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri signs the request with imgproxy's standard HMAC-SHA256 scheme when signing is provided") {
    val signing = ImgProxySigning(key = "68656c6c6f", salt = "776f726c64")

    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), signing = Some(signing))

    uri shouldBe "https://imgproxy.example.com/esRorrp8BQLU81LQm8l52l1Zkr_2T1yQ8djvvubKJoM/w:100/h:200/q:80/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri falls back to the insecure signature if the key/salt are not valid hex") {
    val signing = ImgProxySigning(key = "not-hex!", salt = "also-not-hex!")

    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), signing = Some(signing))

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri includes a non-zero clockwise rotation") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), rotationDegrees = 90)

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/rot:90/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri normalises rotations into 0-359 and omits rot: when there's nothing to rotate") {
    def rotationOf(degrees: Int) =
      ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = None, rotationDegrees = degrees)

    rotationOf(-90).contains("/rot:270/") shouldBe true
    rotationOf(360).contains("rot:") shouldBe false
    rotationOf(0).contains("rot:") shouldBe false
  }

  test("templatedUri always uses the insecure signature, since it is expanded client-side after this URL is built") {
    val uri = ImgProxyUrlBuilder.templatedUri(baseUri, sourceUri, rotationDegrees = 0)

    uri shouldBe "https://imgproxy.example.com/insecure/w:{w}/h:{h}/q:{q}/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("fixedUri adds an exp: segment inside the signed path when an expiry is given") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), expiresEpochSeconds = Some(1700000000L))

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/exp:1700000000/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
  }

  test("s3SourceUri builds a stable s3:// source from an asset's S3 object URL") {
    val file = new URI("http://my-bucket.s3.amazonaws.com/1/0/5/7/b/f/1057bff12c838ad8e7c9cfabd033af14856b67b0")

    ImgProxyUrlBuilder.s3SourceUri("my-bucket", file).toString shouldBe "s3://my-bucket/1/0/5/7/b/f/1057bff12c838ad8e7c9cfabd033af14856b67b0"
  }

  test("s3 sources are not rewritten to localstack URLs in local dev") {
    val s3Source = new URI("s3://my-bucket/a/b/c")

    ImgProxyUrlBuilder.normaliseSourceForLocalDev(s3Source, Some("http://localhost:4566")) shouldBe s3Source
  }

  test("roundedExpiry is stable within a window and valid for between one and two windows") {
    val ttl = 3600L
    val windowStart = 1700000000L / ttl * ttl

    ImgProxyUrlBuilder.roundedExpiry(windowStart, ttl) shouldBe windowStart + 2 * ttl
    ImgProxyUrlBuilder.roundedExpiry(windowStart + ttl - 1, ttl) shouldBe windowStart + 2 * ttl
    ImgProxyUrlBuilder.roundedExpiry(windowStart + ttl, ttl) shouldBe windowStart + 3 * ttl
  }
}
