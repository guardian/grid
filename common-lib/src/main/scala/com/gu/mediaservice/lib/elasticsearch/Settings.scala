package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json

object IndexSettings {

  val englishSStemmer = Json.obj(
    "type" -> "custom",
    "tokenizer" -> "standard",
    "filter" -> Json.arr(
      "lowercase",
      "english_possessive_stemmer",
      "gu_stopwords",
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
    ),
    "english_possessive_stemmer" -> Json.obj(
      "type" -> "stemmer",
      "language" -> "possessive_english"
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
