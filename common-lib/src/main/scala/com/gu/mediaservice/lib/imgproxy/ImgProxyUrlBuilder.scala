package com.gu.mediaservice.lib.imgproxy

import com.gu.mediaservice.lib.logging.GridLogging

import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import scala.util.Try

case class ImgProxySigning(key: String, salt: String)

object ImgProxyUrlBuilder extends GridLogging {
  private val InsecureSignature = "insecure"

  def normaliseSourceForLocalDev(uri: URI, awsLocalEndpoint: Option[String]): URI =
    awsLocalEndpoint match {
      case Some(_) =>
        val query = Option(uri.getRawQuery).map("?" + _).getOrElse("")
        new URI(s"http://localstack:4566${uri.getRawPath}$query")
      case None => uri
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
    signing: Option[ImgProxySigning] = None
  ): String = {
    val encoded = encodeSourceUrl(normaliseSourceForLocalDev(sourceUri, awsLocalEndpoint))
    val rotation = normaliseRotation(rotationDegrees)
    val qualitySegment = quality.map(q => s"/q:$q").getOrElse("")
    val path = s"/w:$width/h:$height$qualitySegment/rot:$rotation/$encoded"
    s"$baseUri/${signatureSegment(signing, path)}$path"
  }
}
