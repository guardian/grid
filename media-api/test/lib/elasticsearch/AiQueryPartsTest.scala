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
  private def aiPartsFor(query: String): AiQueryParts =
    AiQueryParts.from(Parser.run(query))

  describe("AiQueryParts validation") {

    describe("valid queries (each contains a KNN ranking signal)") {

      it("allows a similar-image-only query (image KNN)") {
        val parts = aiPartsFor("similar:abc123")

        parts.similarImageId should be(Some("abc123"))
        parts.semanticQuery should be(None)
        parts.hasKnn should be(true)
        parts.validationError should be(Right(()))
      }

      it("allows a text-only query (text KNN)") {
        val parts = aiPartsFor("keir starmer")

        parts.semanticQuery should be(Some("keir starmer"))
        parts.similarImageId should be(None)
        parts.hasKnn should be(true)
        parts.validationError should be(Right(()))
      }

      it("allows chips/filters combined with a text query (pre-filter then text KNN)") {
        val parts = aiPartsFor("fileType:jpeg keir starmer")

        parts.semanticQuery should be(Some("keir starmer"))
        parts.filterConditions should be(jpegFilter :: standardNegations)
        parts.hasKnn should be(true)
        parts.validationError should be(Right(()))
      }

      it("allows chips/filters combined with a similar image (pre-filter then image KNN)") {
        val parts = aiPartsFor("similar:abc123 fileType:jpeg")

        parts.similarImageId should be(Some("abc123"))
        parts.filterConditions should be(jpegFilter :: standardNegations)
        parts.hasKnn should be(true)
        parts.validationError should be(Right(()))
      }

      it("allows a negative term combined with a text query (negative is a lexical pre-filter, then text KNN)") {
        val parts = aiPartsFor("keir starmer -angela")

        parts.semanticQuery should be(Some("keir starmer"))
        // The negation is treated as a filter condition, not a KNN ranking signal.
        parts.filterConditions should be(negatedAngela :: standardNegations)
        parts.hasKnn should be(true)
        parts.validationError should be(Right(()))
      }

      it("allows a negative term combined with a similar image (negative pre-filter, then image KNN)") {
        val parts = aiPartsFor("similar:abc123 -angela")

        parts.similarImageId should be(Some("abc123"))
        parts.filterConditions should be(negatedAngela :: standardNegations)
        parts.hasKnn should be(true)
        parts.validationError should be(Right(()))
      }
    }

    describe("invalid queries that combine two rankings") {

      it("rejects a similar image combined with a text query (rankings can't be merged)") {
        val parts = aiPartsFor("similar:abc123 keir starmer")

        parts.similarImageId should be(Some("abc123"))
        parts.semanticQuery should be(Some("keir starmer"))
        parts.hasSimilarAndSemanticText should be(true)
        parts.validationError.isLeft should be(true)
      }
    }

    describe("invalid queries that contain no KNN ranking signal") {

      it("rejects a chips/filters-only query") {
        val parts = aiPartsFor("fileType:jpeg")

        parts.semanticQuery should be(None)
        parts.similarImageId should be(None)
        parts.filterConditions should be(jpegFilter :: standardNegations)
        parts.hasKnn should be(false)
        parts.validationError.isLeft should be(true)
      }

      it("rejects a negative-only query") {
        val parts = aiPartsFor("-angela")

        parts.semanticQuery should be(None)
        parts.similarImageId should be(None)
        parts.filterConditions should be(negatedAngela :: standardNegations)
        parts.hasKnn should be(false)
        parts.validationError.isLeft should be(true)
      }

      it("rejects a negative term combined with chips/filters") {
        val parts = aiPartsFor("-angela fileType:jpeg")

        parts.semanticQuery should be(None)
        parts.similarImageId should be(None)
        parts.filterConditions should be(negatedAngela :: jpegFilter :: standardNegations)
        parts.hasKnn should be(false)
        parts.validationError.isLeft should be(true)
      }
    }
  }
}
