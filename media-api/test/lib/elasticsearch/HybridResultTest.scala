package lib.elasticsearch

import com.gu.mediaservice.model.{CohereV4Embedding, Embedding, Handout, Image}
import com.sksamuel.elastic4s.requests.searches.SearchHit
import org.scalactic.Tolerance
import org.scalatest.OptionValues
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.Json

class HybridResultTest extends AnyFunSpec with Matchers with OptionValues with Tolerance with Fixtures {

  import HybridResult.{fuseScoresAndGetTopK, fuseScores, normalise, resolveHitAndFillInSemanticScore, Bm25TheoreticalMin, CosineSimilarityTheoreticalMin}

  private val tolerance = 1e-9

  private def searchHit(id: String, score: Float): SearchHit = SearchHit(
    id = id,
    index = "test-index",
    version = 1L,
    seqNo = 0L,
    primaryTerm = 0L,
    score = score,
    parent = None,
    shard = None,
    node = None,
    routing = None,
    explanation = None,
    sort = None,
    _source = Map.empty,
    fields = Map.empty,
    _highlight = None,
    inner_hits = Map.empty,
    matchedQueries = None
  )

  private def imageWithEmbedding(id: String, embedding: Option[List[Double]]): Image =
    createImage(id, Handout()).copy(
      embedding = embedding.map(vec => Embedding(cohereEmbedV4 = Some(CohereV4Embedding(image = vec))))
    )

  private def sourceWrapperFor(image: Image): SourceWrapper[Image] =
    SourceWrapper(Json.obj(), image, fromIndex = "test-index")

  private def resolveTo(image: Image): SearchHit => Option[SourceWrapper[Image]] =
    _ => Some(sourceWrapperFor(image))

  private val resolveToNothing: SearchHit => Option[SourceWrapper[Image]] = _ => None

  private def hybridResult(id: String, lexicalScore: Double, semanticScore: Double): HybridResult =
    HybridResult(
      id = id,
      lexicalScore = lexicalScore,
      semanticScore = semanticScore,
      image = sourceWrapperFor(imageWithEmbedding(id, embedding = None))
    )

  describe("resolveHitAndFillInSemanticScore") {

    it("returns None when the hit cannot be resolved to an image") {
      val result = resolveHitAndFillInSemanticScore(
        searchHit("img-1", score = 3.0f),
        queryEmbedding = List(1.0, 0.0),
        resolveHit = resolveToNothing
      )
      result should be(None)
    }

    it("carries the hit id and uses the hit score as the lexical score") {
      val image = imageWithEmbedding("img-1", embedding = Some(List(1.0, 0.0)))
      val result = resolveHitAndFillInSemanticScore(
        searchHit("img-1", score = 4.2f),
        queryEmbedding = List(1.0, 0.0),
        resolveHit = resolveTo(image)
      ).value

      result.id should be("img-1")
      result.lexicalScore should be(4.2f.toDouble +- tolerance)
    }

    it("computes the semantic score as the cosine similarity between the image and query embeddings") {
      // Orthogonal vectors -> cosine similarity 0.
      val image = imageWithEmbedding("img-1", embedding = Some(List(0.0, 1.0)))
      val result = resolveHitAndFillInSemanticScore(
        searchHit("img-1", score = 1.0f),
        queryEmbedding = List(1.0, 0.0),
        resolveHit = resolveTo(image)
      ).value

      result.semanticScore should be(0.0 +- tolerance)
    }

    it("returns a cosine similarity of 1 for identical (parallel) embeddings") {
      val image = imageWithEmbedding("img-1", embedding = Some(List(3.0, 4.0)))
      val result = resolveHitAndFillInSemanticScore(
        searchHit("img-1", score = 1.0f),
        queryEmbedding = List(6.0, 8.0),
        resolveHit = resolveTo(image)
      ).value

      result.semanticScore should be(1.0 +- tolerance)
    }

    it("returns a cosine similarity of -1 for opposite embeddings") {
      val image = imageWithEmbedding("img-1", embedding = Some(List(-1.0, 0.0)))
      val result = resolveHitAndFillInSemanticScore(
        searchHit("img-1", score = 1.0f),
        queryEmbedding = List(1.0, 0.0),
        resolveHit = resolveTo(image)
      ).value

      result.semanticScore should be(-1.0 +- tolerance)
    }

    it("falls back to a semantic score of -1 when the image has no embedding") {
      val image = imageWithEmbedding("img-1", embedding = None)
      val result = resolveHitAndFillInSemanticScore(
        searchHit("img-1", score = 1.0f),
        queryEmbedding = List(1.0, 0.0),
        resolveHit = resolveTo(image)
      ).value

      result.semanticScore should be(CosineSimilarityTheoreticalMin +- tolerance)
    }
  }

  describe("normalise") {
    it("maps a score to its fraction of the way from the theoretical min to the max") {
      // Halfway between theoreticalMin 0 and max 10.
      normalise(score = 5.0, max = 10.0, theoreticalMin = Bm25TheoreticalMin) should be(0.5 +- tolerance)
    }

    it("maps the max itself to 1") {
      normalise(score = 10.0, max = 10.0, theoreticalMin = Bm25TheoreticalMin) should be(1.0 +- tolerance)
    }

    it("maps the theoretical min itself to 0") {
      normalise(score = -1.0, max = 1.0, theoreticalMin = CosineSimilarityTheoreticalMin) should be(0.0 +- tolerance)
    }

    it("accounts for a non-zero theoretical min when normalising") {
      // (0 - -1) / (1 - -1) = 0.5
      normalise(score = 0.0, max = 1.0, theoreticalMin = CosineSimilarityTheoreticalMin) should be(0.5 +- tolerance)
    }

    it("returns 0 when the range collapses (max == theoreticalMin)") {
      normalise(score = 0.0, max = 0.0, theoreticalMin = Bm25TheoreticalMin) should be(0.0 +- tolerance)
      normalise(score = -1.0, max = -1.0, theoreticalMin = CosineSimilarityTheoreticalMin) should be(0.0 +- tolerance)
    }
  }

  describe("combinedScore") {
    it("blends the normalised lexical and semantic scores using vecWeight") {
      // normedLexical = 2/4 = 0.5, normedSemantic = (0 + 1)/(1 + 1) = 0.5
      // combined = 0.25 * 0.5 + 0.75 * 0.5 = 0.5
      val score = fuseScores(
        hybridResult("blend", lexicalScore = 2.0, semanticScore = 0.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.25
      )
      score should be(0.5 +- tolerance)
    }

    it("uses only the lexical score when vecWeight is 0") {
      val score = fuseScores(
        hybridResult("lexical-only", lexicalScore = 2.0, semanticScore = 1.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.0
      )
      score should be(0.5 +- tolerance)
    }

    it("uses only the semantic score when vecWeight is 1") {
      val score = fuseScores(
        hybridResult("semantic-only", lexicalScore = 2.0, semanticScore = 0.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 1.0
      )
      // normedSemantic = (0 + 1)/(1 + 1) = 0.5
      score should be(0.5 +- tolerance)
    }

    it("contributes 0 from the lexical side when the max lexical score is 0") {
      val score = fuseScores(
        hybridResult("no-lexical", lexicalScore = 0.0, semanticScore = 1.0),
        maxLexicalScore = 0.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.5
      )
      // normedLexical = 0, normedSemantic = (1 + 1)/(1 + 1) = 1
      // combined = 0.5 * 1 + 0.5 * 0 = 0.5
      score should be(0.5 +- tolerance)
    }

    it("contributes 0 from the semantic side when the max semantic score is -1") {
      val score = fuseScores(
        hybridResult("no-semantic", lexicalScore = 4.0, semanticScore = -1.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = -1.0,
        vecWeight = 0.5
      )
      // normedSemantic = 0, normedLexical = 4/4 = 1
      // combined = 0.5 * 0 + 0.5 * 1 = 0.5
      score should be(0.5 +- tolerance)
    }
  }

  describe("fuseScoresAndGetTopK") {
    it("returns an empty list if the input is empty") {
      fuseScoresAndGetTopK(List(), vecWeight = 0.0, k = 3) should be (List())
    }

    it("ranks purely by lexical score when vecWeight is 0") {
      val results = List(
        hybridResult("low-lexical", lexicalScore = 1.0, semanticScore = 1.0),
        hybridResult("high-lexical", lexicalScore = 10.0, semanticScore = -1.0),
        hybridResult("mid-lexical", lexicalScore = 5.0, semanticScore = 0.0)
      )

      val ranked = fuseScoresAndGetTopK(results, vecWeight = 0.0, k = 3)

      ranked.map(_.id) should be(List("high-lexical", "mid-lexical", "low-lexical"))
    }

    it("ranks purely by lexical score when max semantic score is -1.0") {
      val results = List(
        hybridResult("low-lexical", lexicalScore = 1.0, semanticScore = -1.0),
        hybridResult("high-lexical", lexicalScore = 10.0, semanticScore = -1.0),
        hybridResult("mid-lexical", lexicalScore = 5.0, semanticScore = -1.0)
      )

      val ranked = fuseScoresAndGetTopK(results, vecWeight = 0.5, k = 3)

      ranked.map(_.id) should be(List("high-lexical", "mid-lexical", "low-lexical"))
    }

    it("ranks purely by semantic score when vecWeight is 1") {
      val results = List(
        hybridResult("low-semantic", lexicalScore = 10.0, semanticScore = -1.0),
        hybridResult("high-semantic", lexicalScore = 1.0, semanticScore = 1.0),
        hybridResult("mid-semantic", lexicalScore = 5.0, semanticScore = 0.0)
      )

      val ranked = fuseScoresAndGetTopK(results, vecWeight = 1.0, k = 3)

      ranked.map(_.id) should be(List("high-semantic", "mid-semantic", "low-semantic"))
    }

    it("ranks purely by semantic score when max lexical score is 0") {
      val results = List(
        hybridResult("low-semantic", lexicalScore = 0.0, semanticScore = -1.0),
        hybridResult("high-semantic", lexicalScore = 0.0, semanticScore = 1.0),
        hybridResult("mid-semantic", lexicalScore = 0.0, semanticScore = 0.0)
      )

      val ranked = fuseScoresAndGetTopK(results, vecWeight = 0.5, k = 3)

      ranked.map(_.id) should be(List("high-semantic", "mid-semantic", "low-semantic"))
    }

    it("only returns the top k results") {
      val results = List(
        hybridResult("a", lexicalScore = 1.0, semanticScore = 1.0),
        hybridResult("b", lexicalScore = 10.0, semanticScore = 1.0),
        hybridResult("c", lexicalScore = 5.0, semanticScore = 1.0)
      )

      val ranked = fuseScoresAndGetTopK(results, vecWeight = 0.0, k = 2)

      ranked should have size 2
      ranked.map(_.id) should be(List("b", "c"))
    }

    it("blends the max-normalised lexical and semantic scores using vecWeight") {
      // maxLexical = 4, maxSemantic = 1.
      // For "blend": normedLexical = 2/4 = 0.5, normedSemantic = (0 + 1)/(1 + 1) = 0.5
      //   combined = 0.25 * 0.5 + 0.75 * 0.5 = 0.5
      val results = List(
        hybridResult("top-lexical", lexicalScore = 4.0, semanticScore = -1.0),
        hybridResult("top-semantic", lexicalScore = 0.0, semanticScore = 1.0),
        hybridResult("blend", lexicalScore = 2.0, semanticScore = 0.0)
      )

      val ranked = fuseScoresAndGetTopK(results, vecWeight = 0.25, k = 3)

      val blend = ranked.find(_.id == "blend").value
      // Recompute the expected combined score independently of ordering.
      val normedLexical = blend.lexicalScore / 4.0
      val normedSemantic = (blend.semanticScore + 1) / (1.0 + 1)
      val expectedCombined = 0.25 * normedSemantic + 0.75 * normedLexical
      expectedCombined should be(0.5 +- tolerance)

      // top-lexical: normedLexical = 1, normedSemantic = 0 -> 0.75
      // top-semantic: normedLexical = 0, normedSemantic = 1 -> 0.25
      // blend: 0.5
      ranked.map(_.id) should be(List("top-lexical", "blend", "top-semantic"))
    }
  }
}
