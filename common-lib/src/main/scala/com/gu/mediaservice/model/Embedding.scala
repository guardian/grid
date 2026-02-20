package com.gu.mediaservice.model

import play.api.libs.json.Json
import play.api.libs.json.OFormat

//NOTE - this is the type for both the mapping in ES and the message sent to Thrall,
// so we may want to make a separate type for the updateMessage that allows partial updates
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
