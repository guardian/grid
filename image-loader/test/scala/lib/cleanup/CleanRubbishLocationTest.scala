package scala.lib.cleanup

import lib.cleanup.CleanRubbishLocation
import org.scalatest.{FunSpec, Matchers}

class CleanRubbishLocationTest extends FunSpec with Matchers with MetadataHelper {

  it("should not change a valid name") {
    CleanRubbishLocation.cleanRubbish("Switzerland") should be (Some("Switzerland"))
  }

  it("should strip whitespace names") {
    CleanRubbishLocation.cleanRubbish(" ") should be (None)
  }

  it("should strip '.' names") {
    CleanRubbishLocation.cleanRubbish(".") should be (None)
  }

  it("should strip '-' names") {
    CleanRubbishLocation.cleanRubbish("-") should be (None)
  }

  it("should strip '-' names with whitespace") {
    CleanRubbishLocation.cleanRubbish("  - ") should be (None)
  }


  it("should clean all location fields") {
    val metadata = createImageMetadata(
      "subLocation" -> "-",
      "city"        -> "-",
      "state"       -> "-",
      "country"     -> "-"
    )
    val cleanedMetadata = CleanRubbishLocation.clean(metadata)
    cleanedMetadata.subLocation should be (None)
    cleanedMetadata.city should be (None)
    cleanedMetadata.state should be (None)
    cleanedMetadata.country should be (None)
  }

}
