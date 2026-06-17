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

  def combineScoresAndGetTopK(
    results: List[HybridResult],
    vecWeight: Double,
    k: Int
  ): List[HybridResult] = {
    // Account for the rare case in which KNN doesn't return the true closest vector,
    // and that true closest vector happens to be among the lexical-only results.
    val maxLexicalScore = results.maxBy(_.lexicalScore).lexicalScore
    val maxSemanticScore = results.maxBy(_.semanticScore).semanticScore

    def combinedScore(result: HybridResult): Double = {
      val normedLexicalScore = result.lexicalScore / maxLexicalScore
      // normedScore = (score - theoretical_min) / (max - theoretical_min)
      // This is theoretical min, i.e. -1, to actual max,
      // so it effectively does both the max-norming and the ES-score norming.
      val normedSemanticScore = (result.semanticScore + 1) / (maxSemanticScore + 1)
      (vecWeight * normedSemanticScore) + ((1 - vecWeight) * normedLexicalScore)
    }

    results.sortBy(combinedScore)(Ordering[Double].reverse).take(k)
  }
}
