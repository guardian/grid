package controllers

import lib.querysyntax.Parser
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class MediaApiTest extends AnyFunSpec with Matchers {

  describe("MediaApi.deletedImageUploaderScope") {
    val identity = "user@example.test"

    it("scopes an explicit deleted search for users without global delete permission") {
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats is:deleted"),
        hasGlobalDeletePermission = false,
        identity = identity
      ) shouldBe Some(identity)
    }

    it("does not scope literal text or an explicit deleted exclusion") {
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats \"is:deleted\""),
        hasGlobalDeletePermission = false,
        identity = identity
      ) shouldBe None
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats -is:deleted"),
        hasGlobalDeletePermission = false,
        identity = identity
      ) shouldBe None
    }

    it("does not scope users with global delete permission") {
      MediaApi.deletedImageUploaderScope(
        Parser.run("cats is:deleted"),
        hasGlobalDeletePermission = true,
        identity = identity
      ) shouldBe None
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
