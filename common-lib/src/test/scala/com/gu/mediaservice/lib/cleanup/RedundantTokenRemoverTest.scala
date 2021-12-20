package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class RedundantTokenRemoverTest extends FunSpec with Matchers with MetadataHelper {
  // We've seen "/", " via " and " / " in the wild so test with both
  val separators = List("/", " / ", " via ")

  separators.foreach { s =>
    it (s"Remove redundant byline, keep redundant credit - '$s' separator") {
      BylineCredit("HANDOUT", "HANDOUT")
        .whenCleaned(None, "HANDOUT")
    }

    it (s"Clean partially redundant byline, clean partially redundant credit - '$s' separator") {
      BylineCredit(s"HANDOUT${s}Byline", s"POOL${s}Credit")
        .whenCleaned(Some("Byline"), "Credit")
    }

    it (s"Keep good byline, clean partially redundant credit - '$s' separator") {
      BylineCredit("Byline", s"POOL${s}Credit")
        .whenCleaned(Some("Byline"), "Credit")
    }

    it (s"Keep good byline, simplify redundant credit (use the rightmost) - '$s' separator") {
      BylineCredit("Byline", s"POOL${s}HANDOUT")
        .whenCleaned(Some("Byline"), "HANDOUT")
    }

    it (s"Remove redundant byline, keep good credit - '$s' separator") {
      BylineCredit("HANDOUT", "Credit")
        .whenCleaned(None, "Credit")
    }

    it (s"Keep good byline, keep good credit - '$s' separator") {
      BylineCredit("Byline", "Credit")
        .whenCleaned(Some("Byline"), "Credit")
    }
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
