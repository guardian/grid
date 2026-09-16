package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import lib.querysyntax.{AnyField, IsField, IsValue, Match, Negation, NegationNested, Nested, Parser, Phrase, SingleField, Words}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class AiQueryPartsTest extends AnyFunSpec with Matchers with ImageFields {

  // The parser always appends these two negations to every parsed query, so they
  // always show up as part of the derived filter conditions.
  private val standardNegations = List(
    Negation(Match(IsField, IsValue("deleted"))),
    NegationNested(Nested(SingleField("usages"), SingleField("usages.status"), Phrase("replaced")))
  )

  private val jpegFilter = Match(SingleField(getFieldPath("mimeType")), Words("image/jpeg"))
  private val negatedAngela = Negation(Match(AnyField, Words("angela")))

  // Build the AiQueryParts the same way the controller does: parse the raw query
  // string with the production parser, then derive the AI search parts from it.
  private def aiPartsFor(query: String): Either[AiQueryError, AiQueryParts] =
    AiQueryParts.from(Parser.run(query))

  // Convenience for the valid cases, which are expected to parse into rankable parts.
  private def validPartsFor(query: String): AiQueryParts =
    aiPartsFor(query) match {
      case Right(parts) => parts
      case Left(error) => fail(s"expected a rankable AI query but got: $error")
    }

  describe("AiQueryParts validation") {

    describe("valid queries (each contains a KNN ranking signal)") {

      it("allows a similar-image-only query (image KNN)") {
        val parts = validPartsFor("similar:abc123")

        parts.similarImageId should be(Some("abc123"))
        parts.semanticQuery should be(None)
      }

      it("allows a text-only query (text KNN)") {
        val parts = validPartsFor("keir starmer")

        parts.semanticQuery should be(Some("keir starmer"))
        parts.similarImageId should be(None)
      }

      it("allows chips/filters combined with a text query (pre-filter then text KNN)") {
        val parts = validPartsFor("fileType:jpeg keir starmer")

        parts.semanticQuery should be(Some("keir starmer"))
        parts.filterConditions should be(jpegFilter :: standardNegations)
      }

      it("allows chips/filters combined with a similar image (pre-filter then image KNN)") {
        val parts = validPartsFor("similar:abc123 fileType:jpeg")

        parts.similarImageId should be(Some("abc123"))
        parts.filterConditions should be(jpegFilter :: standardNegations)
      }

      it("allows a negative term combined with a text query (negative is a lexical pre-filter, then text KNN)") {
        val parts = validPartsFor("keir starmer -angela")

        parts.semanticQuery should be(Some("keir starmer"))
        // The negation is treated as a filter condition, not a KNN ranking signal.
        parts.filterConditions should be(negatedAngela :: standardNegations)
      }

      it("allows a negative term combined with a similar image (negative pre-filter, then image KNN)") {
        val parts = validPartsFor("similar:abc123 -angela")

        parts.similarImageId should be(Some("abc123"))
        parts.filterConditions should be(negatedAngela :: standardNegations)
      }
    }

    describe("invalid queries that combine two rankings") {

      it("rejects a similar image combined with a text query (rankings can't be merged)") {
        aiPartsFor("similar:abc123 keir starmer") should be(Left(AiQueryError.ConflictingRankingSignals))
      }
    }

    describe("invalid queries that contain no KNN ranking signal") {

      it("rejects a chips/filters-only query") {
        aiPartsFor("fileType:jpeg") should be(
          Left(AiQueryError.NoRankingSignal(jpegFilter :: standardNegations))
        )
      }

      it("rejects a negative-only query") {
        aiPartsFor("-angela") should be(
          Left(AiQueryError.NoRankingSignal(negatedAngela :: standardNegations))
        )
      }

      it("rejects a negative term combined with chips/filters") {
        aiPartsFor("-angela fileType:jpeg") should be(
          Left(AiQueryError.NoRankingSignal(negatedAngela :: jpegFilter :: standardNegations))
        )
      }
    }
  }
}
