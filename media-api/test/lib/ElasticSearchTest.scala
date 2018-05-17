package lib

import com.gu.mediaservice.lib.auth.{External, Internal}
import com.gu.mediaservice.model.{Handout, StaffPhotographer}
import controllers.SearchParams
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext.Implicits.global

class ElasticSearchTest extends FunSpec with BeforeAndAfterAll with Matchers with ElasticSearchHelper with ScalaFutures {

  override def beforeAll {
    val createTestImages =
      Future.sequence(List(createImage(Handout()), createImage(StaffPhotographer("Yellow Giraffe", "The Guardian"))).map(saveToES))
    Await.ready(createTestImages, 5.seconds)
  }

  describe("ES") {
    it("ES should return only staff photographer pictures for external tier search") {
      val searchParams = SearchParams(tier = External, uploadedBy = Some(testUser))
      val searchResult = ES.search(searchParams)
      whenReady(searchResult) { result =>
        result.total shouldBe 1
      }
    }

    it("ES should return all pictures for internal tier search") {
      val searchParams = SearchParams(tier = Internal, uploadedBy = Some(testUser))
      val searchResult = ES.search(searchParams)
      whenReady(searchResult) { result =>
        result.total shouldBe 2
      }
    }
  }

  override def afterAll {
    Await.ready(cleanTestUserImages(), 5.seconds)
  }
}
