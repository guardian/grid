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

  test("fixedUri adds an exp: segment inside the signed path when an expiry is given") {
    val uri = ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80), expiresEpochSeconds = Some(1700000000L))

    uri shouldBe "https://imgproxy.example.com/insecure/w:100/h:200/q:80/rot:0/exp:1700000000/aHR0cDovL2V4YW1wbGUuY29tL2Zvby5qcGc"
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

  test("signedUrlsForSizes signs one URL per width x height box, smallest first") {
    val signing = ImgProxySigning(key = "68656c6c6f", salt = "776f726c64")

    val urls = ImgProxyUrlBuilder.signedUrlsForSizes(baseUri, sourceUri, sizes = Seq((1920, 1080), (800, 800)), quality = Some(85), signing = signing)

    urls.map(u => (u.width, u.height)) shouldBe Seq((800, 800), (1920, 1080))
    urls.head.url shouldBe ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, 800, 800, Some(85), signing = Some(signing))
    urls.foreach(_.url.contains("/insecure/") shouldBe false)
  }

  test("signedUrlsForSizes orders boxes by area, so the first covering box is the smallest") {
    val signing = ImgProxySigning(key = "68656c6c6f", salt = "776f726c64")

    val urls = ImgProxyUrlBuilder.signedUrlsForSizes(baseUri, sourceUri, sizes = Seq((1280, 1280), (1920, 800), (1280, 800)), quality = None, signing = signing)

    urls.map(u => (u.width, u.height)) shouldBe Seq((1280, 800), (1920, 800), (1280, 1280))
  }

  test("signedUrlsForSizes leaves quality to imgproxy when none is given") {
    val signing = ImgProxySigning(key = "68656c6c6f", salt = "776f726c64")

    val urls = ImgProxyUrlBuilder.signedUrlsForSizes(baseUri, sourceUri, sizes = Seq((1920, 1080)), quality = None, signing = signing)

    urls.head.url.contains("/w:1920/h:1080/rot:0/") shouldBe true
  }

  test("parseSize reads WIDTHxHEIGHT and rejects anything else") {
    ImgProxyUrlBuilder.parseSize("1920x1080") shouldBe Some((1920, 1080))
    ImgProxyUrlBuilder.parseSize(" 800X800 ") shouldBe Some((800, 800))
    ImgProxyUrlBuilder.parseSize("1920") shouldBe None
    ImgProxyUrlBuilder.parseSize("0x1080") shouldBe None
    ImgProxyUrlBuilder.parseSize("axb") shouldBe None
  }
}
