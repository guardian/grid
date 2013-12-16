package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json

object Mappings {

  val nonAnalyzedString = Json.obj("type" -> "string", "index" -> "not_analyzed")

  val snowballAnalysedString = Json.obj("type" -> "string", "analyzer" -> "snowball")
  val standardAnalysedString = Json.obj("type" -> "string", "analyzer" -> "standard")

  val dateFormat = Json.obj("type" -> "date")

  val metadataMapping = Json.obj(
    "properties" -> Json.obj(
      "description" -> snowballAnalysedString,
      "byline" -> standardAnalysedString,
      "title" -> snowballAnalysedString,
      "credit" -> standardAnalysedString,
      "copyrightNotice" -> standardAnalysedString,
      "source" -> standardAnalysedString,
      "specialInstructions" -> nonAnalyzedString,
      "keywords" -> Json.obj("type" -> "string", "index" -> "not_analyzed", "index_name" -> "keyword"),
      "city" -> standardAnalysedString,
      "country" -> standardAnalysedString
    )
  )

  val imageMapping: String =
    Json.stringify(Json.obj(
      "image" -> Json.obj(
        "properties" -> Json.obj(
          "metadata" -> metadataMapping,
          "uploadTime" -> dateFormat,
          "buckets" -> Json.obj("type" -> "string", "index" -> "not_analyzed", "index_name" -> "bucket")
        )
      )
    ))

}
