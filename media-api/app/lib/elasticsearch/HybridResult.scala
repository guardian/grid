package lib.elasticsearch

import com.gu.mediaservice.lib.VectorUtils
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.requests.searches.SearchHit
import play.api.libs.json.Json

// Anything that can be fused and ranked: it only needs the two scores and an id.
// This lets us rank either fully-hydrated results (HybridResult) or lightweight
// candidates (HybridCandidate) with the same scoring code.
sealed trait HybridScored {
  def id: String
  def lexicalScore: Double
  def semanticScore: Double
}

case class HybridResult(
  id: String,
  lexicalScore: Double,
  semanticScore: Double,
  image: SourceWrapper[Image]
) extends HybridScored

// A candidate carries only what we need to rank it. We avoid deserialising a
// full Image for every candidate; only the top-k winners get hydrated later.
case class HybridCandidate(
  id: String,
  lexicalScore: Double,
  semanticScore: Double
) extends HybridScored

object HybridResult {

  // Cosine similarity between the query embedding and the image embedding.
  // We can't use the dot product shortcut because image vectors
  // are truncated 256-dim versions of a normalised 1536-dim vector,
  // meaning they will not have magnitude 1.
  // Note this is true cosine similarity from -1 to 1,
  // *not* the ES-normalised score, but when we max-normalise
  // later it will end up in the range 0-1.
  private def semanticScoreFor(imageEmbedding: Option[List[Double]], queryEmbedding: List[Double]): Double =
    imageEmbedding
      .map(e => VectorUtils.cosineSimilarity(e, queryEmbedding))
      .getOrElse(-1.0)

  def resolveHitAndFillInSemanticScore(
    hit: SearchHit,
    queryEmbedding: List[Double],
    resolveHit: SearchHit => Option[SourceWrapper[Image]]
  ): Option[HybridResult] =
    resolveHit(hit).map { image =>
      val semanticScore = semanticScoreFor(
        image.instance.embedding.flatMap(_.cohereEmbedV4).map(_.image),
        queryEmbedding
      )
      HybridResult(hit.id, lexicalScore = hit.score, semanticScore = semanticScore, image = image)
    }

  // Builds a lightweight candidate by extracting ONLY the embedding vector from a
  // stripped _source (sourceInclude("embedding.cohereEmbedV4.image")), bypassing
  // the full validate[Image] parse so we never hydrate a full Image per candidate.
  def candidateWithSemanticScore(
    hit: SearchHit,
    queryEmbedding: List[Double]
  ): HybridCandidate = {
    val imageEmbedding =
      (Json.parse(hit.sourceAsString) \ "embedding" \ "cohereEmbedV4" \ "image").asOpt[List[Double]]
    val semanticScore = semanticScoreFor(imageEmbedding, queryEmbedding)
    HybridCandidate(hit.id, lexicalScore = hit.score, semanticScore = semanticScore)
  }

  // This is the "theoretical min-max" normalisation chosen by
  // "An Analysis of Fusion Functions for Hybrid Retrieval"
  // https://arxiv.org/pdf/2210.11934
  def normalise(score: Double, max: Double, theoreticalMin: Double): Double =
    if (max == theoreticalMin) 0.0
    else (score - theoreticalMin) / (max - theoreticalMin)

  def combinedScore(
    result: HybridScored,
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

  def combineScoresAndGetTopK[T <: HybridScored](
    results: List[T],
    vecWeight: Double,
    k: Int
  ): List[T] = {
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
