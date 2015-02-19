package scala.lib.cleanup

import lib.cleanup.ExtractGuardianCreditFromByline
import org.scalatest.{FunSpec, Matchers}

class ExtractGuardianCreditFromBylineTest extends FunSpec with Matchers with MetadataHelper {

  it("should not infer any credit from a plain byline") {
    val metadata = createImageMetadata("byline" -> "Helmut Schon", "credit" -> "Getty Images")
    val mappedMetadata = ExtractGuardianCreditFromByline.clean(metadata)
    mappedMetadata.byline should be (Some("Helmut Schon"))
    mappedMetadata.credit should be (Some("Getty Images"))
  }

  it("should extract a Guardian credit from a 'for the Guardian' byline") {
    val metadata = createImageMetadata("byline" -> "Helmut Schon for the Guardian")
    val mappedMetadata = ExtractGuardianCreditFromByline.clean(metadata)
    mappedMetadata.byline should be (Some("Helmut Schon"))
    mappedMetadata.credit should be (Some("The Guardian"))
  }

  it("should extract a Guardian credit from a 'for The GUARDIAN' byline with bad capitalisation") {
    val metadata = createImageMetadata("byline" -> "Helmut Schon for The GUARDIAN")
    val mappedMetadata = ExtractGuardianCreditFromByline.clean(metadata)
    mappedMetadata.byline should be (Some("Helmut Schon"))
    mappedMetadata.credit should be (Some("The Guardian"))
  }

  it("should extract a Guardian credit from a 'for the Guardian.' byline with trailing dot") {
    val metadata = createImageMetadata("byline" -> "Helmut Schon for the Guardian.")
    val mappedMetadata = ExtractGuardianCreditFromByline.clean(metadata)
    mappedMetadata.byline should be (Some("Helmut Schon"))
    mappedMetadata.credit should be (Some("The Guardian"))
  }

  it("should extract a Guardian credit from a 'for the Guardian' byline and override any existing one") {
    val metadata = createImageMetadata("byline" -> "Helmut Schon for the Guardian", "credit" -> "Whatever")
    val mappedMetadata = ExtractGuardianCreditFromByline.clean(metadata)
    mappedMetadata.byline should be (Some("Helmut Schon"))
    mappedMetadata.credit should be (Some("The Guardian"))
  }

  it("should extract an Observer credit from a 'for the Observer' byline and override any existing one") {
    val metadata = createImageMetadata("byline" -> "Helmut Schon for the Observer", "credit" -> "Whatever")
    val mappedMetadata = ExtractGuardianCreditFromByline.clean(metadata)
    mappedMetadata.byline should be (Some("Helmut Schon"))
    mappedMetadata.credit should be (Some("The Observer"))
  }

}
