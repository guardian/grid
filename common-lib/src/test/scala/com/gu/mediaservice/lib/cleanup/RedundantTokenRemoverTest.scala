package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class RedundantTokenRemoverTest extends FunSpec with Matchers with MetadataHelper {
  it ("Remove redundant byline, keep redundant credit") {
    BylineCredit("HANDOUT", "HANDOUT")
      .whenCleaned(None, "HANDOUT")
  }

  it ("Keep good byline, clean partially redundant credit") {
    BylineCredit("Byline Person", "POOL/Credit")
      .whenCleaned(Some("Byline Person"), "Credit")
  }

  it ("Keep good byline, simplify redundant credit") {
    BylineCredit("Byline Person", "POOL/HANDOUT")
      .whenCleaned(Some("Byline Person"), "HANDOUT")
  }

  it ("Remove redundant byline, keep good credit") {
    BylineCredit("HANDOUT", "Credit")
      .whenCleaned(None, "Credit")
  }

  it ("Keep good byline, keep good credit") {
    BylineCredit("Byline Person", "Credit")
      .whenCleaned(Some("Byline Person"), "Credit")
  }

  case class BylineCredit(byline: String, credit: String) {
    def whenCleaned(cByline: Option[String], cCredit: String) = {
      val metadata = createImageMetadata(
        "byline" -> byline,
        "credit" -> credit
      )
      val cleanMetadata = RedundantTokenRemover.clean(metadata)

      cleanMetadata.byline should be (cByline)
      cleanMetadata.credit should be (Some(cCredit))
    }
  }
}
