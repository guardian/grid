package com.gu.mediaservice.model

import play.api.libs.json.Json
import play.api.libs.json.OFormat

case class Embedding(
    cohereEmbedEnglishV3: CohereV3Embedding
)

case class CohereV3Embedding(
    image: List[Double]
)

object Embedding {
    implicit val format: OFormat[Embedding] = Json.format[Embedding]
}

object CohereV3Embedding {
  implicit val format: OFormat[CohereV3Embedding] = Json.format[CohereV3Embedding]
}
