package com.gu.mediaservice.model

import play.api.Logger
import play.api.libs.json._

class UnsupportedMimeTypeException extends Exception

sealed trait MimeType {
  def name: String = this match {
    case Jpeg => "image/jpeg"
    case Png => "image/png"
    case Tiff => "image/tiff"
  }

  def fileExtension: String = name.split('/').reverse.head

  override def toString: String = this.name
}

object MimeType {
  def apply(value: String): MimeType = value.toLowerCase match {
    case "image/jpeg" => Jpeg
    case "image/png" => Png
    case "image/tiff" => Tiff
    case _ => {
      Logger.warn(s"Unsupported mime type $value")
      throw new UnsupportedMimeTypeException
    }
  }

  implicit val reads: Reads[MimeType] = JsPath.read[String].map(MimeType(_))

  implicit val writer: Writes[MimeType] = (mimeType: MimeType) => JsString(mimeType.toString)
}

object Jpeg extends MimeType {
  override def fileExtension: String = "jpg"
}

object Png extends MimeType
object Tiff extends MimeType
