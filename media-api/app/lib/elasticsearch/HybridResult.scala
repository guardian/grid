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

// Whether a result was originally returned by the lexical query, the semantic
// query, or both. A shared result tends to rank highly, so this is useful both
// for debugging and for understanding why something appears where it does.
sealed trait ResultSource
object ResultSource {
  case object Lexical extends ResultSource
  case object Semantic extends ResultSource
  case object Both extends ResultSource

  def from(inLexical: Boolean, inSemantic: Boolean): ResultSource =
    (inLexical, inSemantic) match {
      case (true, true) => Both
      case (true, false) => Lexical
      // A ranked result always comes from at least one side, so the remaining
      // case is "semantic only".
      case (false, _) => Semantic
    }
}

// The intermediate scoring detail for a single result: the two normalised
// component scores and the weighted blend of them that we actually rank by.
case class FusedScore(
  normedLexicalScore: Double,
  normedSemanticScore: Double,
  fusedScore: Double
)

// A fully scored, ranked result. Carries the original scores (via `result`),
// where it came from (`source`), the normalised scores and the fused score
// (both via `score`) so the whole ranking decision is inspectable.
case class RankedResult(
  result: HybridResult,
  source: ResultSource,
  score: FusedScore
)

object HybridResult {
  // Theoretical minimum cosine similarity (opposite vectors).
  val CosineSimilarityTheoreticalMin: Double = -1.0
  // Theoretical minimum BM25 lexical score.
  val Bm25TheoreticalMin: Double = 0.0

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
        .getOrElse(CosineSimilarityTheoreticalMin)
      HybridResult(hit.id, lexicalScore = hit.score, semanticScore = semanticScore, image = image)
    }

  // This is the "theoretical min-max" normalisation chosen by
  // "An Analysis of Fusion Functions for Hybrid Retrieval"
  // https://arxiv.org/pdf/2210.11934
  def normalise(score: Double, max: Double, theoreticalMin: Double): Double =
    if (max == theoreticalMin) 0.0
    else (score - theoreticalMin) / (max - theoreticalMin)

  def fuseScores(
    result: HybridResult,
    maxLexicalScore: Double,
    maxSemanticScore: Double,
    vecWeight: Double
  ): FusedScore = {
    val normedLexicalScore = normalise(result.lexicalScore, maxLexicalScore, theoreticalMin = Bm25TheoreticalMin)
    // The semantic theoretical min of -1 means we do both the max-norming
    // and the ES-score norming in one step.
    val normedSemanticScore = normalise(result.semanticScore, maxSemanticScore, theoreticalMin = CosineSimilarityTheoreticalMin)
    val fusedScore = (vecWeight * normedSemanticScore) + ((1 - vecWeight) * normedLexicalScore)
    FusedScore(normedLexicalScore, normedSemanticScore, fusedScore)
  }

  // Combines the lexical and semantic result sets into a single, ranked list.
  //
  // Each input result already carries both scores (the semantic query is
  // rescored to BM25 server-side, and resolveHitAndFillInSemanticScore fills in
  // the cosine similarity client-side), so this function only has to: tag each
  // result with where it came from, de-duplicate, normalise + fuse the scores,
  // then sort and take the top k.
  def fuseAndRank(
    lexicalResults: List[HybridResult],
    semanticResults: List[HybridResult],
    vecWeight: Double,
    k: Int
  ): List[RankedResult] = {
    val lexicalIds = lexicalResults.map(_.id).toSet
    val semanticIds = semanticResults.map(_.id).toSet

    // De-duplicating by id is safe because, at this point, every result (lexical
    // or semantic) carries only the lexical (BM25) score from Elasticsearch, so
    // the two copies of a shared result are identical.
    val distinctResults = (lexicalResults ::: semanticResults).distinctBy(_.id)

    // Why compute the maxes ourselves rather than reading them from Elasticsearch's
    // top result or hits.maxScore? Because for the semantic query we rescore by BM25,
    // so neither maxScore nor the top result reflects the max semantic score.
    //
    // A side benefit is that this also accounts for the rare case in which KNN
    // doesn't contain the true closest vector, and that true closest vector
    // happens to be among the lexical-only results.
    (for {
      maxLexicalScore <- distinctResults.map(_.lexicalScore).maxOption
      maxSemanticScore <- distinctResults.map(_.semanticScore).maxOption
    } yield {
      distinctResults
        .map { result =>
          RankedResult(
            result = result,
            source = ResultSource.from(lexicalIds.contains(result.id), semanticIds.contains(result.id)),
            score = fuseScores(result, maxLexicalScore, maxSemanticScore, vecWeight)
          )
        }
        .sortBy(_.score.fusedScore)(Ordering[Double].reverse)
        .take(k)
    }).getOrElse(List())
  }
}
