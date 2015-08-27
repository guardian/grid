package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json.JsValueWrapper
import play.api.libs.json.Json

object IndexSettings {

  val englishSStemmer = Json.obj(
    "type" -> "custom",
    "tokenizer" -> "standard",
    "filter" -> Json.arr(
      "gu_stopwords",
      "lowercase",
      "s_stemmer"
    )
  )

  val filter = Json.obj(
    "s_stemmer" -> Json.obj(
      "type" -> "stemmer",
      "language" -> "minimal_english"
    ),
    "gu_stopwords" -> Json.obj(
      "type" -> "stop",
      "stopwords" -> "_english_"
    )
  )

  val analyzer = Json.obj(
    "english_s_stemmer" -> englishSStemmer
  )

  val analysis = Json.obj(
    "filter" -> filter,
    "analyzer" -> analyzer
  )

  val imageSettings: String =
    Json.stringify(Json.obj(
      "analysis" -> analysis
    )
  )

}
