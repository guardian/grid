package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model._

import java.net.URLEncoder

trait ContentDisposition extends GridLogging {

  def useShortenDownloadFilename: Boolean

  def getContentDisposition(image: Image, imageType: ImageType): String = {
    val asset = imageType match {
      case Source => image.source
      case Thumbnail => image.thumbnail.getOrElse(image.source)
      case OptimisedPng => image.optimisedPng.getOrElse(image.source)
    }
    val extension: String = getExtension(image, asset)
    val filenameSuffix: String = s"(${image.id})$extension"
    val baseFilename = getBaseFilename(image, filenameSuffix)
    getContentDisposition(baseFilename, image.id)
  }

  def getContentDisposition(image: Image, crop: Crop, asset: Asset): String = {
    val cropId: String = crop.id.map(id => s"($id)").getOrElse("")
    val extension: String = getExtension(image, asset)
    val dimensions: String = asset.dimensions.map(dims => s"(${dims.width} x ${dims.height})").getOrElse("")
    val filenameSuffix: String = s"(${image.id})$cropId$dimensions$extension"
    val baseFilename = getBaseFilename(image, filenameSuffix)

    getContentDisposition(baseFilename, image.id)
  }

  private def getExtension(image: Image, asset: Asset): String = asset.mimeType match {
    case Some(mimeType) => mimeType.fileExtension
    case _ =>
      logger.warn(image.toLogMarker, "Unrecognised mime type")
      ""
  }

  private def getBaseFilename(image: Image, filenameSuffix: String): String = image.uploadInfo.filename match {
    case Some(_) if useShortenDownloadFilename => s"$filenameSuffix".filter(!"()".contains(_))
    case Some(f) => s"${removeExtension(f)} $filenameSuffix"
    case _ => filenameSuffix
  }

  private def getContentDisposition(filename: String, fallbackLatin1Filename: String): String = {
    // use both `filename` and `filename*` parameters for compatibility with user agents not implementing RFC 5987
    // they'll fallback to `filename`, which will be a UTF-8 string decoded as Latin-1 - this is a rubbish string, but only rubbish browsers don't support RFC 5987 (IE8 back)
    // See http://tools.ietf.org/html/rfc6266#section-5
    val filenameUTF8 = encodedUTF8Filename(filename)
    s"""attachment; filename="$fallbackLatin1Filename"; filename*=UTF-8''$filenameUTF8"""
  }

  private def removeExtension(filename: String): String = {
    val regex = """\.[a-zA-Z]{3,4}$""".r
    regex.replaceAllIn(filename, "")
  }

  private def encodedUTF8Filename(filename: String): String = {
      // URLEncoder converts ` ` to `+`, replace it with `%20`
      // See http://docs.oracle.com/javase/6/docs/api/java/net/URLEncoder.html
      URLEncoder.encode(filename, "UTF-8").replace("+", "%20")
  }

}
