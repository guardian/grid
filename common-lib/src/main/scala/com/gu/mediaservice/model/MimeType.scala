package com.gu.mediaservice.model

import com.gu.mediaservice.lib.logging.GridLogging
import play.api.libs.json._

class UnsupportedMimeTypeException(val mimeType: String) extends Exception

sealed trait MimeType {
  def name: String = this match {
    case Jpeg => "image/jpeg"
    case Png => "image/png"
    case Tiff => "image/tiff"
  }

  def fileExtension: String = s".${name.split('/').reverse.head}"

  override def toString: String = this.name
}

object MimeType extends GridLogging {
  def apply(value: String): MimeType = value.toLowerCase match {
    case "image/jpeg" => Jpeg
    case "image/png" => Png
    case "image/tiff" => Tiff

    // Support crops created in the early years of Grid (~2016) which state mime type w/out an 'image/' prefix
    // TODO correct these values in a reindex
    case "jpg" => {
      logger.info("Encountered legacy mime type representation (jpg)")
      Jpeg
    }
    case "png" => {
      logger.info("Encountered legacy mime type representation (png)")
      Png
    }

    case _ => {
      logger.warn(s"Unsupported mime type $value")
      throw new UnsupportedMimeTypeException(value)
    }
  }

  implicit val reads: Reads[MimeType] = JsPath.read[String].map(MimeType(_))

  implicit val writer: Writes[MimeType] = (mimeType: MimeType) => JsString(mimeType.toString)
}

object Jpeg extends MimeType {
  override def fileExtension: String = ".jpg"
}

object Png extends MimeType
object Tiff extends MimeType
