package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json

object Mappings {

  val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")

  val stemmedString = Json.obj("type" -> "string", "analyzer" -> "snowball")

  val dateFormat = Json.obj("type" -> "basic_date_time_no_millis")

  val metadataMapping = Json.obj(
    "properties" -> Json.obj(
      "description" -> stemmedString,
      "byline" -> nonAnalyzedString,
      "title" -> stemmedString,
      "credit" -> nonAnalyzedString,
      "copyrightNotice" -> nonAnalyzedString,
      "source" -> nonAnalyzedString,
      "specialInstructions" -> nonAnalyzedString,
      "keywords" -> Json.obj("type" -> "string", "index" -> "not_analyzed", "index_name" -> "keyword"),
      "city" -> nonAnalyzedString,
      "country" -> nonAnalyzedString
    )
  )

  val imageMapping: String =
    Json.stringify(Json.obj(
      "image" -> Json.obj(
        "properties" -> Json.obj(
          "imagePath" -> nonAnalyzedString,
          "thumbPath" -> nonAnalyzedString,
          "metadata" -> metadataMapping,
          "upload-time" -> dateFormat,
          "buckets" -> Json.obj("type" -> "string", "index" -> "not_analyzed", "index_name" -> "bucket")
        )
      )
    ))

}
