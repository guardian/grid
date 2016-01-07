package com.gu.mediaservice.lib.elasticsearch

import play.api.libs.json.Json
import play.api.libs.json.Json.JsValueWrapper

object IndexSettings {
  def customAnalyzer(tokenizer: String, filters: List[String]) =
    Json.obj(
      "type" -> "custom",
      "tokenizer" -> tokenizer,
      "filter" -> filters
    )

  // TODO rename `english_s_stemmer` as its an analyzer not a stemmer - would require a reindex.
  val enslishSStemmerAnalyzerName = "english_s_stemmer"
  val englishSStemmerAnalyzer = customAnalyzer("standard", List(
    "lowercase",
    "asciifolding",
    "english_possessive_stemmer",
    "gu_stopwords",
    "s_stemmer"
  ))

  val hierarchyAnalyserName = "hierarchyAnalyzer"
  val hierarchyAnalyzer = customAnalyzer("path_hierarchy", List("lowercase"))

  val filter = Json.obj(
    "s_stemmer"                  -> Json.obj("type" -> "stemmer", "language"  -> "minimal_english"),
    "gu_stopwords"               -> Json.obj("type" -> "stop",    "stopwords" -> "_english_"),
    "english_possessive_stemmer" -> Json.obj("type" -> "stemmer", "language"  -> "possessive_english")
  )

  val analyzers = Json.obj(
    enslishSStemmerAnalyzerName -> englishSStemmerAnalyzer,
    hierarchyAnalyserName -> hierarchyAnalyzer
  )

  val analysis = Json.obj(
    "filter" -> filter,
    "analyzer" -> analyzers
  )

  val imageSettings: String =
    Json.stringify(Json.obj(
      "analysis" -> analysis
    )
  )

}
