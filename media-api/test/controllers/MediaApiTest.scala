package controllers

import com.gu.mediaservice.lib.argo.model.{CollectionResponse, ExtraCounts}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.Json

class MediaApiTest extends AnyFunSpec with Matchers {

  describe("AI search response metadata") {
    it("serializes the semantic maximum in the existing actions envelope") {
      val response = CollectionResponse(
        length = Some(0),
        data = Seq.empty[String],
        actions = Some(ExtraCounts(Map.empty, maxSemanticSimilarity = Some(0.6)))
      )

      (Json.toJson(response) \ "actions" \ "maxSemanticSimilarity").as[Double] shouldBe 0.6
    }

    it("omits the semantic maximum when it is unavailable") {
      val response = CollectionResponse(
        length = Some(0),
        data = Seq.empty[String],
        actions = Some(ExtraCounts(Map.empty))
      )

      (Json.toJson(response) \ "actions" \ "maxSemanticSimilarity").toOption shouldBe None
    }
  }

  describe("MediaApi.shouldSkipUsageRecording") {
    it("skips recording when the URI is a download and the user is the InDesign API key") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/download",
        user = MediaApi.InDesignIdentity
      ) shouldBe true
    }

    it("does not skip recording for a download from a real user") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/download",
        user = "some-real-user@guardian.co.uk"
      ) shouldBe false
    }

    it("does not skip recording for a syndication request, even from the InDesign API key") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/syndication",
        user = MediaApi.InDesignIdentity
      ) shouldBe false
    }

    it("does not skip recording for a syndication request from a real user") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/syndication",
        user = "some-real-user@guardian.co.uk"
      ) shouldBe false
    }
  }
}
