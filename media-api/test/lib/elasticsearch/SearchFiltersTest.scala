package lib.elasticsearch

import com.gu.mediaservice.model._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class SearchFiltersTest extends AnyFunSpec with Matchers with Fixtures {

  describe("freeToUseCategories") {
    it("should include the legacy categories of a free replacement category in config.applicableUsageRights") {
      val searchFilters = new SearchFilters(mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PublisherPhotographer")))

      searchFilters.freeToUseCategories shouldEqual PublisherPhotographer.allCategories.list.toList
    }

    it("should include the legacy categories of a conditional replacement category in config.applicableUsageRights") {
      val searchFilters = new SearchFilters(mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PRAndThirdParty")))

      searchFilters.freeToUseCategories shouldEqual PRAndThirdParty.allCategories.list.toList
    }

    it("should not include the legacy categories of a replacement category that is not free or conditional") {
      val searchFilters = new SearchFilters(mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.PayToUse")))

      searchFilters.freeToUseCategories shouldBe empty
    }

    it("should not include legacy categories when the replacement is not in config.applicableUsageRights") {
      val searchFilters = new SearchFilters(mediaApiConfigWithApplicableUsageRights(List("com.gu.mediaservice.model.StaffPhotographer")))

      searchFilters.freeToUseCategories shouldEqual List(StaffPhotographer.category)
    }
  }
}
