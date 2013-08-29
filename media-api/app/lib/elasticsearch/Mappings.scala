package lib.elasticsearch

import play.api.libs.json.{JsValue, Json}

object Mappings {

  val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")

  val stemmedString = Json.obj("type" -> "string", "analyzer" -> "snowball")

  val dateFormat = Json.obj("type" -> "date")

  val imageMapping: String =
    Json.stringify(Json.obj(
      "image" -> Json.obj(
        "properties" -> Json.obj(
          "imagePath" -> nonAnalyzedString
        )
      )
    ))

}
