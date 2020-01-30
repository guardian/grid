package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.requests.analysis.{Analysis, CustomAnalyzer, PathHierarchyTokenizer, StandardTokenizer, StemmerTokenFilter, StopTokenFilter, TokenFilter}
import com.sksamuel.elastic4s.requests.analyzers.{AsciiFoldingTokenFilter, LowercaseTokenFilter}
import org.elasticsearch.index.analysis.ASCIIFoldingTokenFilterFactory

object IndexSettings {

  private val s_stemmer = "s_stemmer"
  private val english_possessive_stemmer = "english_possessive_stemmer"
  private val gu_stopwords = "gu_stopwords"
  private val standard = "standard"
  private val path_hierarchy = "path_hierarchy"
  // TODO rename `english_s_stemmer` as its an analyzer not a stemmer - would require a reindex.
  val englishSStemmerAnalyzerName = "english_" + s_stemmer
  val hierarchyAnalyserName = "hierarchyAnalyzer"

  def analysis: Analysis = {
    val tokenizers = List(
      StandardTokenizer(standard),
      PathHierarchyTokenizer(path_hierarchy)
    )

    val filters: List[TokenFilter] = List(
// I (Justin) don't think we need to specify these, but can just refer to them by name (below)
//      LowercaseTokenFilter,
//      AsciiFoldingTokenFilter,
      StemmerTokenFilter(name = english_possessive_stemmer, lang = "possessive_english"),
      StopTokenFilter(name = gu_stopwords, stopwords = Seq("_english_")),
      StemmerTokenFilter(name = s_stemmer, lang = "minimal_english")
    )

    val englishSStemmerAnalyzer = CustomAnalyzer(
      englishSStemmerAnalyzerName,
      standard,
      List(),
      List(
        LowercaseTokenFilter.name,
        AsciiFoldingTokenFilter.name,
        english_possessive_stemmer,
        gu_stopwords,
        s_stemmer
      )
    )

    val hierarchyAnalyzer = CustomAnalyzer(
      hierarchyAnalyserName,
      path_hierarchy,
      List(),
      List(LowercaseTokenFilter.name)
    )

    val analyzers = List(englishSStemmerAnalyzer, hierarchyAnalyzer)

    Analysis(
      analyzers,
      tokenizers,
      filters,
    )
  }

}
