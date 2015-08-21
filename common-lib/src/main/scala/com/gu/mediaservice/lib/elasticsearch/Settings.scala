package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json.JsValueWrapper
import play.api.libs.json.Json

object IndexSettings {

  val englishSStemmer = Json.obj(
    "tokenizer" -> "standard",
    "filter" -> Json.arr(
      "lowercase",
      "s_stemmer"
    )
  )

  val sStemmer = Json.obj(
    "s_stemmer" -> Json.obj(
      "type" -> "stemmer",
      "language" -> "minimal_english"
    )
  )

  val analysis = Json.obj(
    "filter" -> sStemmer
  )

  val analyzer = Json.obj(
    "english_s_stemmer" -> englishSStemmer
  )

  val imageSettings: String =
    Json.stringify(Json.obj(
      "settings" -> Json.obj(
        "analysis" -> analysis,
        "analyzer" -> analyzer
      )
    )
  )

}
