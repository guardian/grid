package com.gu.mediaservice.lib.imgproxy

import com.gu.mediaservice.lib.logging.GridLogging

import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.util.Try

case class ImgProxySigning(key: String, salt: String)

/** A pre-signed imgproxy URL that resizes to fit within a `width` x `height` box. */
case class SignedImgProxyUrl(width: Int, height: Int, url: String)

object ImgProxyUrlBuilder extends GridLogging {
  private val InsecureSignature = "insecure"

  /**
    * A stable `s3://bucket/key` source for imgproxy to fetch with its own IAM role (IMGPROXY_USE_S3).
    * Unlike a pre-signed S3 URL this is identical on every request, so the resulting imgproxy URL can be
    * cached by browsers and CDNs, and it carries no credentials. `file` is the asset's S3 object URL.
    */
  def s3SourceUri(bucket: String, file: URI): URI =
    new URI(s"s3://$bucket/${file.getPath.stripPrefix("/")}")

  /**
    * Expiry timestamp (epoch seconds) for a signed URL, rounded to a `ttlSeconds` boundary so that every
    * URL issued within the same window is identical (and so cacheable). URLs are valid for between one
    * and two `ttlSeconds` after they are issued.
    */
  def roundedExpiry(nowEpochSeconds: Long, ttlSeconds: Long): Long =
    (nowEpochSeconds / ttlSeconds + 2) * ttlSeconds

  def normaliseSourceForLocalDev(uri: URI, awsLocalEndpoint: Option[String]): URI =
    awsLocalEndpoint match {
      case Some(_) if uri.getScheme != "s3" =>
        val query = Option(uri.getRawQuery).map("?" + _).getOrElse("")
        new URI(s"http://localstack:4566${uri.getRawPath}$query")
      case _ => uri
    }

  private def encodeSourceUrl(sourceUri: URI): String =
    Base64.getUrlEncoder.withoutPadding.encodeToString(sourceUri.toString.getBytes(StandardCharsets.UTF_8))

  private def normaliseRotation(rotationDegrees: Int): Int =
    if (rotationDegrees < 0) rotationDegrees + 360 else rotationDegrees

  private def hexToBytes(hex: String): Array[Byte] =
    hex.trim.stripPrefix("0x").replace(":", "").replace(" ", "")
      .grouped(2).map(Integer.parseInt(_, 16).toByte).toArray

  private def sign(signing: ImgProxySigning, path: String): Option[String] =
    Try {
      val mac = Mac.getInstance("HmacSHA256")
      mac.init(new SecretKeySpec(hexToBytes(signing.key), "HmacSHA256"))
      mac.update(hexToBytes(signing.salt))
      val digest = mac.doFinal(path.getBytes(StandardCharsets.UTF_8))
      Base64.getUrlEncoder.withoutPadding.encodeToString(digest)
    }.toOption

  private def signatureSegment(signing: Option[ImgProxySigning], path: String): String =
    signing.flatMap(sign(_, path)) match {
      case Some(signature) => signature
      case None =>
        if (signing.isDefined) {
          logger.error("Failed to sign imgproxy URL (bad IMGPROXY_KEY/IMGPROXY_SALT?) - falling back to " +
            "an insecure URL, which will be rejected unless IMGPROXY_ALLOW_INSECURE=true")
        }
        InsecureSignature
    }

  def templatedUri(baseUri: String, sourceUri: URI, rotationDegrees: Int, awsLocalEndpoint: Option[String] = None): String = {
    val encoded = encodeSourceUrl(normaliseSourceForLocalDev(sourceUri, awsLocalEndpoint))
    val rotation = normaliseRotation(rotationDegrees)
    s"$baseUri/$InsecureSignature/w:{w}/h:{h}/q:{q}/rot:$rotation/$encoded"
  }

  def fixedUri(
    baseUri: String,
    sourceUri: URI,
    width: Int,
    height: Int,
    quality: Option[Int],
    awsLocalEndpoint: Option[String] = None,
    rotationDegrees: Int = 0,
    signing: Option[ImgProxySigning] = None,
    expiresEpochSeconds: Option[Long] = None
  ): String = {
    val encoded = encodeSourceUrl(normaliseSourceForLocalDev(sourceUri, awsLocalEndpoint))
    val rotation = normaliseRotation(rotationDegrees)
    val qualitySegment = quality.map(q => s"/q:$q").getOrElse("")
    val expirySegment = expiresEpochSeconds.map(e => s"/exp:$e").getOrElse("")
    val path = s"/w:$width/h:$height$qualitySegment/rot:$rotation$expirySegment/$encoded"
    s"$baseUri/${signatureSegment(signing, path)}$path"
  }

  /**
    * Signed URLs for a fixed set of (width, height) bounding boxes, smallest first. A signature covers the
    * resize parameters, so clients can't fill in their own sizes; instead they pick the smallest box that
    * covers what they need. With no quality, imgproxy uses its per-format default (IMGPROXY_FORMAT_QUALITY).
    */
  def signedUrlsForSizes(
    baseUri: String,
    sourceUri: URI,
    sizes: Seq[(Int, Int)],
    quality: Option[Int],
    signing: ImgProxySigning,
    awsLocalEndpoint: Option[String] = None,
    rotationDegrees: Int = 0,
    expiresEpochSeconds: Option[Long] = None
  ): Seq[SignedImgProxyUrl] =
    sizes.distinct.sortBy { case (width, height) => (width.toLong * height, width) }.map { case (width, height) =>
      SignedImgProxyUrl(width, height, fixedUri(
        baseUri, sourceUri, width, height, quality, awsLocalEndpoint, rotationDegrees, Some(signing), expiresEpochSeconds
      ))
    }

  /** Parses a "WIDTHxHEIGHT" size, e.g. "1920x1080". */
  def parseSize(size: String): Option[(Int, Int)] =
    size.trim.toLowerCase.split('x') match {
      case Array(w, h) => for {
        width <- w.trim.toIntOption if width > 0
        height <- h.trim.toIntOption if height > 0
      } yield (width, height)
      case _ => None
    }
}
