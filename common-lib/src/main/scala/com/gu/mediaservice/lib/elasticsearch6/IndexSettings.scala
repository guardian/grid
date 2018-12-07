package com.gu.mediaservice.lib.elasticsearch6

import com.sksamuel.elastic4s.analyzers._

object IndexSettings {

  val hierarchyAnalyserName = "hierarchyAnalyzer"
  // TODO rename `english_s_stemmer` as its an analyzer not a stemmer - would require a reindex.
  val englishSStemmerAnalyzerName = "english_s_stemmer"

  def analysis = {
    val guStopWords = StopTokenFilter(name = "gu_stopwords", stopwords = Seq("_english_"))

    val sStemmer = StemmerTokenFilter(name = "s_stemmer", lang = "minimal_english")

    val englishPossessiveStemmer = StemmerTokenFilter(name = "english_possessive_stemmer", lang = "progressive_english")

    val englishSStemmerAnalyzer = CustomAnalyzerDefinition(name = englishSStemmerAnalyzerName,
      tokenizer = StandardTokenizer,
      filters = Seq(LowercaseTokenFilter, AsciiFoldingTokenFilter, englishPossessiveStemmer, guStopWords, sStemmer))

    val hierarchyAnalyzer = CustomAnalyzerDefinition(name = hierarchyAnalyserName,
      tokenizer = PathHierarchyTokenizer(name = "path_hierarchy"),
      filters = Seq(LowercaseTokenFilter)
    )

    Seq(englishSStemmerAnalyzer, hierarchyAnalyzer)
  }

}