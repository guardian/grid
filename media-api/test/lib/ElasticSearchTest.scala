package lib

import com.gu.mediaservice.lib.auth.{External, Internal}
import controllers.SearchParams
import org.scalatest.{FunSpec, Matchers}

import scala.concurrent.ExecutionContext.Implicits.global

class ElasticSearchTest extends FunSpec with Matchers with ElasticSearchHelper {
  describe("ElasticSearch") {

    it("should return only staff photographer pictures for external tier search") {
      val searchParams = SearchParams(tier = External)
      val searchResult = ES.search(searchParams)
      searchResult.map { result =>
        result.total should be (1)
      }
    }

    it("should return all pictures for internal tier search") {
      val searchParams = SearchParams(tier = Internal)
      val searchResult = ES.search(searchParams)
      searchResult.map { result =>
        result.total should be (4)
      }
    }
  }
}
