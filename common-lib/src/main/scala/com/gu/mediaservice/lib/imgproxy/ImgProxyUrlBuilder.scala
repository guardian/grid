package com.gu.mediaservice.lib.imgproxy

import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
  * The key and salt imgproxy verifies URL signatures with (IMGPROXY_KEY / IMGPROXY_SALT), decoded once from hex
  * so a bad value fails at startup rather than when signing.
  */
final class ImgProxySigning private (prototype: Mac) {

  /** imgproxy's signature for a path: base64url(HMAC-SHA256(key, salt + path)), without padding. */
  def sign(path: String): String = {
    // A Mac isn't thread-safe; cloning the never-mutated prototype is, and keeps its key and salt state
    val mac = prototype.clone().asInstanceOf[Mac]
    ImgProxyUrlBuilder.Base64Url.encodeToString(mac.doFinal(path.getBytes(StandardCharsets.UTF_8)))
  }
}

object ImgProxySigning {
  private val Algorithm = "HmacSHA256"

  def apply(keyHex: String, saltHex: String): ImgProxySigning = {
    val key = new SecretKeySpec(hexToBytes("key", keyHex), Algorithm)
    val salt = hexToBytes("salt", saltHex)
    val mac = Mac.getInstance(Algorithm)
    mac.init(key)
    mac.update(salt)
    new ImgProxySigning(mac)
  }

  /**
    * Signing from optional config: on when both key and salt are set, off when neither is (blank counts as unset).
    * Only one being set is a misconfiguration that imgproxy would answer with 403s, so it fails at startup instead.
    */
  def fromConfig(keyHex: Option[String], saltHex: Option[String]): Option[ImgProxySigning] =
    (keyHex.map(_.trim).filter(_.nonEmpty), saltHex.map(_.trim).filter(_.nonEmpty)) match {
      case (Some(key), Some(salt)) => Some(ImgProxySigning(key, salt))
      case (None, None) => None
      case _ => throw new IllegalArgumentException("imgproxy key and salt must either both be set (signed URLs) or both be unset (unsigned URLs)")
    }

  private def hexToBytes(name: String, hex: String): Array[Byte] = {
    val digits = hex.trim
    require(digits.nonEmpty && digits.length % 2 == 0 && digits.forall(Character.digit(_, 16) >= 0),
      s"imgproxy $name must be a non-empty, hex-encoded string")
    digits.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
  }
}

/** A signed imgproxy URL that resizes to fit within a `width` x `height` box. */
case class SignedImgProxyUrl(width: Int, height: Int, url: String)

/**
  * Builds imgproxy URLs: `<base>/<signature>/rs:fit:<w>:<h>[/q:<quality>]/ar:false/sm:true[/rot:<degrees>][/exp:<epoch>]/<source>`,
  * where `<source>` is the base64url-encoded `s3://` URL of the image and `<signature>` is `insecure` when unsigned.
  * See docs/06-objects-of-interest/03-imgproxy.md for the imgproxy settings these URLs rely on.
  */
object ImgProxyUrlBuilder {
  private val InsecureSignature = "insecure"
  private[imgproxy] val Base64Url: Base64.Encoder = Base64.getUrlEncoder.withoutPadding

  /**
    * A stable `s3://bucket/key` source for imgproxy to fetch with its own IAM role (IMGPROXY_USE_S3).
    * Unlike a pre-signed S3 URL this is identical on every request, so the resulting imgproxy URL can be
    * cached by browsers and CDNs, and it carries no credentials. `file` is the asset's S3 object URL.
    */
  def s3SourceUri(bucket: String, file: URI): String =
    s"s3://$bucket/${file.getPath.stripPrefix("/")}"

  /**
    * Expiry timestamp (epoch seconds) for a signed URL, rounded to a `ttlSeconds` boundary so that every
    * URL issued within the same window is identical (and so cacheable). URLs are valid for between one
    * and two `ttlSeconds` after they are issued.
    */
  def roundedExpiry(nowEpochSeconds: Long, ttlSeconds: Long): Long =
    (nowEpochSeconds / ttlSeconds + 2) * ttlSeconds

  private[imgproxy] def encodeSource(sourceUri: String): String =
    Base64Url.encodeToString(sourceUri.getBytes(StandardCharsets.UTF_8))

  /**
    * Grid applies its own orientation correction (clockwise `rotationDegrees`), so URLs turn off imgproxy's EXIF
    * auto-rotation and strip metadata, so browsers don't re-apply it, whatever the server's configuration.
    */
  private def orientationSegment(rotationDegrees: Int): String =
    Math.floorMod(rotationDegrees, 360) match {
      case 0 => "/ar:false/sm:true"
      case rotation => s"/ar:false/sm:true/rot:$rotation"
    }

  /** An unsigned URL for clients to expand with their own `w`, `h` and `q`. */
  def templatedUri(baseUri: String, sourceUri: String, rotationDegrees: Int): String =
    s"$baseUri/$InsecureSignature/rs:fit:{w}:{h}/q:{q}${orientationSegment(rotationDegrees)}/${encodeSource(sourceUri)}"

  private def expirySegment(expiresEpochSeconds: Option[Long]): String =
    expiresEpochSeconds.fold("")(e => s"/exp:$e")

  /** A URL for a fixed size, signed if signing is configured. With no quality, imgproxy uses its per-format default. */
  def fixedUri(
    baseUri: String,
    sourceUri: String,
    width: Int,
    height: Int,
    quality: Option[Int] = None,
    rotationDegrees: Int = 0,
    signing: Option[ImgProxySigning] = None,
    expiresEpochSeconds: Option[Long] = None
  ): String = {
    val qualitySegment = quality.fold("")(q => s"/q:$q")
    val path = s"/rs:fit:$width:$height$qualitySegment${orientationSegment(rotationDegrees)}${expirySegment(expiresEpochSeconds)}/${encodeSource(sourceUri)}"
    s"$baseUri/${signing.fold(InsecureSignature)(_.sign(path))}$path"
  }

  /** De-duplicates (width, height) boxes and orders them smallest first, as `signedUrlsForSizes` expects. */
  def sortSizes(sizes: Seq[(Int, Int)]): Seq[(Int, Int)] =
    sizes.distinct.sortBy { case (width, height) => (width.toLong * height, width) }

  /**
    * Signed URLs for a fixed set of (width, height) boxes, already ordered by `sortSizes`. A signature covers
    * the resize parameters, so clients can't fill in their own sizes; instead they pick the smallest box that
    * covers what they need.
    */
  def signedUrlsForSizes(
    baseUri: String,
    sourceUri: String,
    sizes: Seq[(Int, Int)],
    signing: ImgProxySigning,
    rotationDegrees: Int = 0,
    expiresEpochSeconds: Option[Long] = None
  ): Seq[SignedImgProxyUrl] = {
    val sharedSuffix = s"${orientationSegment(rotationDegrees)}${expirySegment(expiresEpochSeconds)}/${encodeSource(sourceUri)}"
    sizes.map { case (width, height) =>
      val path = s"/rs:fit:$width:$height$sharedSuffix"
      SignedImgProxyUrl(width, height, s"$baseUri/${signing.sign(path)}$path")
    }
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
