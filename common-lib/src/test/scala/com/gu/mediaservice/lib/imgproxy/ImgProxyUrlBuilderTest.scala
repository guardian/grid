package com.gu.mediaservice.lib.imgproxy

import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.Base64

class ImgProxyUrlBuilderTest extends AnyFunSuiteLike {

  private val baseUri = "https://imgproxy.example.com"
  private val sourceUri = "s3://my-bucket/1/0/5/7/b/f/1057bff12c838ad8e7c9cfabd033af14856b67b0"

  // imgproxy expects the source URL base64url-encoded, without padding
  private val encodedSource = Base64.getUrlEncoder.withoutPadding.encodeToString(sourceUri.getBytes(StandardCharsets.UTF_8))

  // Every URL turns off imgproxy's EXIF auto-rotation and strips metadata, since Grid applies orientation itself
  private val orientation = "ar:false/sm:true"

  // The worked example from imgproxy's docs (https://docs.imgproxy.net/usage/signing_url): key "secret" and
  // salt "hello" sign this path as oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8
  private val docsSigning = ImgProxySigning(keyHex = "736563726574", saltHex = "68656C6C6F")
  private val docsPath = "/rs:fill:300:400:0/g:sm/aHR0cDovL2V4YW1w/bGUuY29tL2ltYWdl/cy9jdXJpb3NpdHku/anBn.png"
  private val docsSignature = "oKfUtW34Dvo2BGQehJFR4Nr0_rIjOtdtzJ3QFsUcXH8"

  test("signing matches the worked example in imgproxy's documentation") {
    docsSigning.sign(docsPath) shouldBe docsSignature
  }

  test("signing is repeatable, since each signature starts from the same key and salt state") {
    docsSigning.sign(docsPath) shouldBe docsSigning.sign(docsPath)
  }

  test("signing rejects a key or salt that isn't hex-encoded") {
    assertThrows[IllegalArgumentException](ImgProxySigning(keyHex = "not-hex!", saltHex = "68656C6C6F"))
    assertThrows[IllegalArgumentException](ImgProxySigning(keyHex = "736563726574", saltHex = "abc"))
    assertThrows[IllegalArgumentException](ImgProxySigning(keyHex = "", saltHex = "68656C6C6F"))
  }

  test("fromConfig signs only when both key and salt are set, treating blank as unset") {
    ImgProxySigning.fromConfig(Some("736563726574"), Some("68656C6C6F")).map(_.sign(docsPath)) shouldBe Some(docsSignature)
    ImgProxySigning.fromConfig(None, None) shouldBe None
    ImgProxySigning.fromConfig(Some(""), Some(" ")) shouldBe None
  }

  test("fromConfig rejects only one of key and salt being set") {
    assertThrows[IllegalArgumentException](ImgProxySigning.fromConfig(Some("736563726574"), None))
    assertThrows[IllegalArgumentException](ImgProxySigning.fromConfig(Some(""), Some("68656C6C6F")))
  }

  test("encodeSource base64url-encodes the source without padding") {
    ImgProxyUrlBuilder.encodeSource(sourceUri) shouldBe "czM6Ly9teS1idWNrZXQvMS8wLzUvNy9iL2YvMTA1N2JmZjEyYzgzOGFkOGU3YzljZmFiZDAzM2FmMTQ4NTZiNjdiMA"
  }

  test("fixedUri is unsigned when no signing is provided") {
    val options = s"rs:fit:100:200/q:80/$orientation"

    ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, quality = Some(80)) shouldBe
      s"$baseUri/insecure/$options/$encodedSource"
  }

  test("fixedUri leaves quality to imgproxy when none is given") {
    ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200) shouldBe
      s"$baseUri/insecure/rs:fit:100:200/$orientation/$encodedSource"
  }

  test("fixedUri signs everything after the signature: options, expiry and source") {
    val path = s"/rs:fit:100:200/$orientation/exp:1700000000/$encodedSource"

    ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, signing = Some(docsSigning), expiresEpochSeconds = Some(1700000000L)) shouldBe
      s"$baseUri/${docsSigning.sign(path)}$path"
  }

  test("fixedUri adds a clockwise rotation, normalised into 0-359") {
    ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, rotationDegrees = 90) shouldBe
      s"$baseUri/insecure/rs:fit:100:200/$orientation/rot:90/$encodedSource"
    ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, rotationDegrees = -90) shouldBe
      s"$baseUri/insecure/rs:fit:100:200/$orientation/rot:270/$encodedSource"
  }

  test("fixedUri omits rot: when there's nothing to rotate, but still turns off auto-rotation") {
    ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, width = 100, height = 200, rotationDegrees = 360) shouldBe
      s"$baseUri/insecure/rs:fit:100:200/$orientation/$encodedSource"
  }

  test("templatedUri is unsigned, since clients expand it after this URL is built") {
    ImgProxyUrlBuilder.templatedUri(baseUri, sourceUri, rotationDegrees = 180) shouldBe
      s"$baseUri/insecure/rs:fit:{w}:{h}/q:{q}/$orientation/rot:180/$encodedSource"
  }

  test("s3SourceUri builds a stable s3:// source from an asset's S3 object URL") {
    val file = new URI("http://my-bucket.s3.amazonaws.com/1/0/5/7/b/f/1057bff12c838ad8e7c9cfabd033af14856b67b0")

    ImgProxyUrlBuilder.s3SourceUri("my-bucket", file) shouldBe sourceUri
  }

  test("roundedExpiry is stable within a window and valid for between one and two windows") {
    val ttl = 3600L
    val windowStart = 1700000000L / ttl * ttl

    ImgProxyUrlBuilder.roundedExpiry(windowStart, ttl) shouldBe windowStart + 2 * ttl
    ImgProxyUrlBuilder.roundedExpiry(windowStart + ttl - 1, ttl) shouldBe windowStart + 2 * ttl
    ImgProxyUrlBuilder.roundedExpiry(windowStart + ttl, ttl) shouldBe windowStart + 3 * ttl
  }

  test("sortSizes de-duplicates boxes and orders them by area so the first covering box is the smallest") {
    ImgProxyUrlBuilder.sortSizes(Seq((1920, 1080), (800, 800), (1280, 1280), (800, 800))) shouldBe
      Seq((800, 800), (1280, 1280), (1920, 1080))
  }

  test("signedUrlsForSizes signs one URL per box, matching fixedUri") {
    val sizes = Seq((1920, 1080), (2560, 1440))
    val urls = ImgProxyUrlBuilder.signedUrlsForSizes(baseUri, sourceUri, sizes, docsSigning, rotationDegrees = 90, expiresEpochSeconds = Some(1700000000L))

    urls.map(u => (u.width, u.height)) shouldBe sizes
    urls.map(_.url) shouldBe sizes.map { case (w, h) =>
      ImgProxyUrlBuilder.fixedUri(baseUri, sourceUri, w, h, rotationDegrees = 90, signing = Some(docsSigning), expiresEpochSeconds = Some(1700000000L))
    }
  }

  test("parseSize reads WIDTHxHEIGHT and rejects anything else") {
    ImgProxyUrlBuilder.parseSize("1920x1080") shouldBe Some((1920, 1080))
    ImgProxyUrlBuilder.parseSize(" 800X800 ") shouldBe Some((800, 800))
    ImgProxyUrlBuilder.parseSize("1920") shouldBe None
    ImgProxyUrlBuilder.parseSize("0x1080") shouldBe None
    ImgProxyUrlBuilder.parseSize("axb") shouldBe None
  }
}
