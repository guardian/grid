package lib.elasticsearch

import com.gu.mediaservice.model.{CohereV4Embedding, Embedding, Handout, Image}
import com.sksamuel.elastic4s.requests.searches.SearchHit
import org.scalactic.Tolerance
import org.scalatest.OptionValues
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.Json

class HybridResultTest extends AnyFunSpec with Matchers with OptionValues with Tolerance with Fixtures {

  import HybridResult.{fuseAndRank, fuseScores, normalise, resolveHitAndFillInSemanticScore, Bm25TheoreticalMin, CosineSimilarityTheoreticalMin}

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

  describe("fuseScores") {
    it("exposes the normalised lexical and semantic component scores") {
      // normedLexical = 2/4 = 0.5, normedSemantic = (0 + 1)/(1 + 1) = 0.5
      val score = fuseScores(
        hybridResult("components", lexicalScore = 2.0, semanticScore = 0.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.25
      )
      score.normedLexicalScore should be(0.5 +- tolerance)
      score.normedSemanticScore should be(0.5 +- tolerance)
    }

    it("blends the normalised lexical and semantic scores using vecWeight") {
      // normedLexical = 2/4 = 0.5, normedSemantic = (0 + 1)/(1 + 1) = 0.5
      // fused = 0.25 * 0.5 + 0.75 * 0.5 = 0.5
      val score = fuseScores(
        hybridResult("blend", lexicalScore = 2.0, semanticScore = 0.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.25
      )
      score.fusedScore should be(0.5 +- tolerance)
    }

    it("uses only the lexical score when vecWeight is 0") {
      val score = fuseScores(
        hybridResult("lexical-only", lexicalScore = 2.0, semanticScore = 1.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.0
      )
      score.fusedScore should be(0.5 +- tolerance)
    }

    it("uses only the semantic score when vecWeight is 1") {
      val score = fuseScores(
        hybridResult("semantic-only", lexicalScore = 2.0, semanticScore = 0.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = 1.0,
        vecWeight = 1.0
      )
      // normedSemantic = (0 + 1)/(1 + 1) = 0.5
      score.fusedScore should be(0.5 +- tolerance)
    }

    it("falls back to the semantic score for a pure semantic search (no lexical matches, so max lexical score is 0)") {
      val score = fuseScores(
        hybridResult("no-lexical", lexicalScore = 0.0, semanticScore = 1.0),
        maxLexicalScore = 0.0,
        maxSemanticScore = 1.0,
        vecWeight = 0.5
      )
      // normedLexical = 0, normedSemantic = (1 + 1)/(1 + 1) = 1
      // fused = 0.5 * 1 + 0.5 * 0 = 0.5
      score.normedLexicalScore should be(0.0 +- tolerance)
      score.fusedScore should be(0.5 +- tolerance)
    }

    it("falls back to the lexical score when no result has an embedding (so max semantic score is -1)") {
      val score = fuseScores(
        hybridResult("no-semantic", lexicalScore = 4.0, semanticScore = -1.0),
        maxLexicalScore = 4.0,
        maxSemanticScore = -1.0,
        vecWeight = 0.5
      )
      // normedSemantic = 0, normedLexical = 4/4 = 1
      // fused = 0.5 * 0 + 0.5 * 1 = 0.5
      score.normedSemanticScore should be(0.0 +- tolerance)
      score.fusedScore should be(0.5 +- tolerance)
    }
  }

  describe("fuseAndRank") {
    import ResultSource.{Lexical, Semantic, Both}

    it("returns an empty list if both inputs are empty") {
      fuseAndRank(lexicalResults = List(), semanticResults = List(), vecWeight = 0.0, k = 3) should be(List())
    }

    it("ranks purely by lexical score when vecWeight is 0") {
      val lexical = List(
        hybridResult("low-lexical", lexicalScore = 1.0, semanticScore = 1.0),
        hybridResult("high-lexical", lexicalScore = 10.0, semanticScore = -1.0),
        hybridResult("mid-lexical", lexicalScore = 5.0, semanticScore = 0.0)
      )

      val ranked = fuseAndRank(lexical, semanticResults = List(), vecWeight = 0.0, k = 3)

      ranked.map(_.result.id) should be(List("high-lexical", "mid-lexical", "low-lexical"))
    }

    it("ranks purely by lexical score when no result has an embedding (so max semantic score is -1.0)") {
      val lexical = List(
        hybridResult("low-lexical", lexicalScore = 1.0, semanticScore = -1.0),
        hybridResult("high-lexical", lexicalScore = 10.0, semanticScore = -1.0),
        hybridResult("mid-lexical", lexicalScore = 5.0, semanticScore = -1.0)
      )

      val ranked = fuseAndRank(lexical, semanticResults = List(), vecWeight = 0.5, k = 3)

      ranked.map(_.result.id) should be(List("high-lexical", "mid-lexical", "low-lexical"))
    }

    it("ranks purely by semantic score when vecWeight is 1") {
      val semantic = List(
        hybridResult("low-semantic", lexicalScore = 10.0, semanticScore = -1.0),
        hybridResult("high-semantic", lexicalScore = 1.0, semanticScore = 1.0),
        hybridResult("mid-semantic", lexicalScore = 5.0, semanticScore = 0.0)
      )

      val ranked = fuseAndRank(lexicalResults = List(), semantic, vecWeight = 1.0, k = 3)

      ranked.map(_.result.id) should be(List("high-semantic", "mid-semantic", "low-semantic"))
    }

    it("ranks purely by semantic score for a pure semantic search (no lexical matches, so max lexical score is 0)") {
      val semantic = List(
        hybridResult("low-semantic", lexicalScore = 0.0, semanticScore = -1.0),
        hybridResult("high-semantic", lexicalScore = 0.0, semanticScore = 1.0),
        hybridResult("mid-semantic", lexicalScore = 0.0, semanticScore = 0.0)
      )

      val ranked = fuseAndRank(lexicalResults = List(), semantic, vecWeight = 0.5, k = 3)

      ranked.map(_.result.id) should be(List("high-semantic", "mid-semantic", "low-semantic"))
    }

    it("only returns the top k results") {
      val lexical = List(
        hybridResult("a", lexicalScore = 1.0, semanticScore = 1.0),
        hybridResult("b", lexicalScore = 10.0, semanticScore = 1.0),
        hybridResult("c", lexicalScore = 5.0, semanticScore = 1.0)
      )

      val ranked = fuseAndRank(lexical, semanticResults = List(), vecWeight = 0.0, k = 2)

      ranked should have size 2
      ranked.map(_.result.id) should be(List("b", "c"))
    }

    it("de-duplicates a result that appears in both sets, keeping it once") {
      val lexical = List(hybridResult("shared", lexicalScore = 4.0, semanticScore = 1.0))
      val semantic = List(hybridResult("shared", lexicalScore = 4.0, semanticScore = 1.0))

      val ranked = fuseAndRank(lexical, semantic, vecWeight = 0.5, k = 10)

      ranked.map(_.result.id) should be(List("shared"))
    }

    it("tags each result with whether it came from lexical, semantic, or both") {
      val lexical = List(
        hybridResult("lexical-only", lexicalScore = 3.0, semanticScore = -1.0),
        hybridResult("shared", lexicalScore = 4.0, semanticScore = 1.0)
      )
      val semantic = List(
        hybridResult("shared", lexicalScore = 4.0, semanticScore = 1.0),
        hybridResult("semantic-only", lexicalScore = 0.0, semanticScore = 0.5)
      )

      val ranked = fuseAndRank(lexical, semantic, vecWeight = 0.5, k = 10)

      ranked.map(r => r.result.id -> r.source).toMap should be(Map(
        "lexical-only" -> Lexical,
        "semantic-only" -> Semantic,
        "shared" -> Both
      ))
    }

    it("produces a ranked table of original scores, normed scores, source and fused score") {
      // maxLexical = 4, maxSemantic = 1, vecWeight = 0.25.
      val lexical = List(
        hybridResult("top-lexical", lexicalScore = 4.0, semanticScore = -1.0),
        hybridResult("blend", lexicalScore = 2.0, semanticScore = 0.0)
      )
      val semantic = List(
        hybridResult("blend", lexicalScore = 2.0, semanticScore = 0.0),
        hybridResult("top-semantic", lexicalScore = 0.0, semanticScore = 1.0)
      )

      val ranked = fuseAndRank(lexical, semantic, vecWeight = 0.25, k = 10)

      // A flat projection of the full ranked output, ordered by fused score descending.
      val table = ranked.map { r =>
        (r.result.id, r.source, r.result.lexicalScore, r.result.semanticScore,
          r.score.normedLexicalScore, r.score.normedSemanticScore, r.score.fusedScore)
      }

      // id               source      lexical  semantic   normedLex  normedSem  fused
      table should be(List(
        ("top-lexical",   Lexical,    4.0,     -1.0,      1.0,       0.0,       0.75),
        ("blend",         Both,       2.0,      0.0,      0.5,       0.5,       0.50),
        ("top-semantic",  Semantic,   0.0,      1.0,      0.0,       1.0,       0.25)
      ))
    }
  }
}
