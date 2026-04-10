package com.gu.mediaservice.model

import play.api.libs.json.Json
import play.api.libs.json.OFormat

//NOTE - this is the type for both the mapping in ES and the message sent to Thrall,
// so we may want to make a separate type for the updateMessage that allows partial updates
// once we add Cohere V4
case class Embedding(
    cohereEmbedEnglishV3: Option[CohereV3Embedding] = None,
    cohereEmbedV4: Option[CohereV4Embedding] = None
)

case class CohereV3Embedding(
    image: List[Double]
)

object CohereV3Embedding {
  implicit val format: OFormat[CohereV3Embedding] = Json.format[CohereV3Embedding]
}

case class CohereV4Embedding(
  image: List[Double]
)

object CohereV4Embedding {
  implicit val format: OFormat[CohereV4Embedding] = Json.format[CohereV4Embedding]
}

object Embedding {
    implicit val format: OFormat[Embedding] = Json.format[Embedding]
}
