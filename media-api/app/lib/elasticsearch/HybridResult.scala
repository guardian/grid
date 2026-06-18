package lib.elasticsearch

import com.gu.mediaservice.lib.VectorUtils
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.requests.searches.SearchHit

case class HybridResult(
  id: String,
  lexicalScore: Double,
  semanticScore: Double,
  image: SourceWrapper[Image]
)

object HybridResult {
  def resolveHitAndFillInSemanticScore(
    hit: SearchHit,
    queryEmbedding: List[Double],
    resolveHit: SearchHit => Option[SourceWrapper[Image]]
  ): Option[HybridResult] =
    resolveHit(hit).map { image =>
      val semanticScore = image.instance.embedding
        .flatMap(_.cohereEmbedV4)
        // We can't use the dot product shortcut because image vectors
        // are truncated 256-dim versions of a normalised 1536-dim vector,
        // meaning they will not have magnitude 1.
        // Note this is true cosine similarity from -1 to 1,
        // *not* the ES-normalised score, but when we max-normalise
        // later it will end up in the range 0-1.
        .map(e => VectorUtils.cosineSimilarity(e.image, queryEmbedding))
        .getOrElse(-1.0)
      HybridResult(hit.id, lexicalScore = hit.score, semanticScore = semanticScore, image = image)
    }

  // This is the "theoretical min-max" normalisation chosen by
  // "An Analysis of Fusion Functions for Hybrid Retrieval"
  // https://arxiv.org/pdf/2210.11934
  def normalise(score: Double, max: Double, theoreticalMin: Double): Double =
    if (max == theoreticalMin) 0.0
    else (score - theoreticalMin) / (max - theoreticalMin)

  def combinedScore(
    result: HybridResult,
    maxLexicalScore: Double,
    maxSemanticScore: Double,
    vecWeight: Double
  ): Double = {
    val normedLexicalScore = normalise(result.lexicalScore, maxLexicalScore, theoreticalMin = 0.0)
    // The semantic theoretical min of -1 means we do both the max-norming
    // and the ES-score norming in one step.
    val normedSemanticScore = normalise(result.semanticScore, maxSemanticScore, theoreticalMin = -1.0)
    (vecWeight * normedSemanticScore) + ((1 - vecWeight) * normedLexicalScore)
  }

  def combineScoresAndGetTopK(
    results: List[HybridResult],
    vecWeight: Double,
    k: Int
  ): List[HybridResult] = {
    // Why do this rather than looking at the top result from elasticsearch or hits.maxScore?
    // Because for the semantic query, we rescore by BM25, meaning neither maxScore nor the
    // top result will actually tell us the max semantic score.
    //
    // A side benefit is that this approach also accounts for the rare case in which KNN
    // doesn't even contain true closest vector, and that true closest vector happens to
    // be among the lexical-only results.
    (for {
      maxLexicalScore <- results.map(_.lexicalScore).maxOption
      maxSemanticScore <- results.map(_.semanticScore).maxOption
    } yield {
      results
        .sortBy(combinedScore(_, maxLexicalScore, maxSemanticScore, vecWeight))(Ordering[Double].reverse)
        .take(k)
    }).getOrElse(List())
  }
}
