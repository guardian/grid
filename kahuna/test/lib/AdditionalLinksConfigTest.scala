package lib

import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import play.api.Configuration

class AdditionalLinksConfigTest extends AnyFreeSpec with Matchers {

  "The config loader" - {
    val configuration = Configuration.from(Map(
      "links.additional" -> List(
        Map(
          "name" -> "A",
          "target" -> "_blank",
          "url" -> "https://a.com"
        ),
        Map(
          "name" -> "C",
          "target" -> "_self",
          "url" -> "/c"
        ),
        Map(
          "name" -> "D",
          "target" -> "_parent",
          "url" -> "https://d.com"
        ),
        Map(
          "name" -> "F",
          "target" -> "_top",
          "url" -> "https://f.com"
        ),
        Map(
          "name" -> "E",
          "url" -> "https://e.com"
        ),
      )
    ))

    val additionalLinks: Seq[AdditionalLink] = configuration
      .getOptional[Seq[AdditionalLink]]("links.additional").getOrElse(Seq.empty)

    "should return a list of links when links.additional is configured" in {
      additionalLinks.nonEmpty shouldBe true
      additionalLinks.length shouldBe 5
    }

    "should return a link with name A, with blank target and https://a.com url" in {
      additionalLinks.headOption.nonEmpty shouldBe true
      val link = additionalLinks.head
      link.name shouldBe "A"
      link.target shouldBe LinkTarget.blank
      link.url shouldBe "https://a.com"
    }

    "should return a link with default blank target" in {
      val link = additionalLinks.last
      link.name shouldBe "E"
      link.target shouldBe LinkTarget.blank
    }
  }

}
