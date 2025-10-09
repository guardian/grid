package com.gu.mediaservice.model

import play.api.libs.json.Json
import play.api.libs.json.OFormat

case class ImageEmbedding(
    cohereEmbedEnglishV3: List[Double]
)

object ImageEmbedding {
    implicit val format: OFormat[ImageEmbedding] = Json.format[ImageEmbedding]
}