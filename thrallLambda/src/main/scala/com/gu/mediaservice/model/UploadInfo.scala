package com.gu.mediaservice.model

import play.api.libs.json.Json

case class UploadInfo(filename: Option[String] = None)

object UploadInfo {
  implicit val jsonWrites = Json.writes[UploadInfo]
  implicit val jsonReads = Json.reads[UploadInfo]
}
