package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json

object IndexSettings {
  val englishAnalyzerName = "english_analyzer"

  val englishAnalyzer = Json.obj(
    "type" -> "custom",
    "tokenizer" -> "standard",
    "filter" -> Json.arr(
      "english_possessive_stemmer",
      "lowercase",
      "english_stop",
      "light_english_stemmer",
      "asciifolding"
    )
  )

  val filter = Json.obj(
    "light_english_stemmer" -> Json.obj(
      "type" -> "stemmer",
      "language" -> "light_english"
    ),
    "english_stop" -> Json.obj(
      "type" -> "stop",
      "stopwords" -> "_english_"
    ),
    "english_possessive_stemmer" -> Json.obj(
      "type" -> "stemmer",
      "language" -> "possessive_english"
    )
  )

  val analyzer = Json.obj(
    englishAnalyzerName -> englishAnalyzer
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
