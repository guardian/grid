package com.gu.mediaservice.model

import play.api.libs.json.{Json, OWrites, Reads}

case class UploadInfo(filename: Option[String] = None, isFeedUpload: Option[Boolean] = None)

object UploadInfo {
  implicit val jsonWrites: OWrites[UploadInfo] = Json.writes[UploadInfo]
  implicit val jsonReads: Reads[UploadInfo] = Json.reads[UploadInfo]
}
