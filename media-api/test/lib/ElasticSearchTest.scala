package lib

import com.gu.mediaservice.lib.auth.{Internal, ReadOnly, Syndication}
import com.gu.mediaservice.model.{Handout, StaffPhotographer}
import controllers.SearchParams
import org.joda.time.{DateTime, DateTimeUtils}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

import scala.concurrent.{Await, Future}
import scala.concurrent.duration._
import scala.concurrent.ExecutionContext.Implicits.global

class ElasticSearchTest extends FunSpec with BeforeAndAfterAll with Matchers with ElasticSearchHelper with ScalaFutures {

  override def beforeAll {
    ES.ensureAliasAssigned()
    val createTestImages =
      Future.sequence(List(
        createImage(Handout()),
        createImage(StaffPhotographer("Yellow Giraffe", "The Guardian")),
        createImage(Handout()),
        createImageWithSyndicationRights(Handout(), rightsAcquired = true, None),
        createImageWithSyndicationRights(Handout(), rightsAcquired = true, Some(DateTime.parse("2018-01-01"))),
        createImageWithSyndicationRights(Handout(), rightsAcquired = true, Some(DateTime.parse("2018-07-02T00:00:00"))),
        createImageWithSyndicationRights(Handout(), rightsAcquired = false, None),
        createExampleImage()
      ).map(saveToES))
    Await.ready(createTestImages, 2.seconds)

    // mocks `DateTime.now`
    val startDate = DateTime.parse("2018-03-01")
    DateTimeUtils.setCurrentMillisFixed(startDate.getMillis)
  }

  describe("ES") {
    it("ES should return only rights acquired pictures for a syndication tier search and filter out example image") {
      val searchParams = SearchParams(tier = Syndication, uploadedBy = Some(testUser))
      val searchResult = ES.search(searchParams)
      whenReady(searchResult) { result =>
        result.total shouldBe 1
      }
    }

    it("ES should return all pictures for internal tier search") {
      val searchParams = SearchParams(tier = Internal, uploadedBy = Some(testUser))
      val searchResult = ES.search(searchParams)
      whenReady(searchResult) { result =>
        result.total shouldBe 8
      }
    }

    it("ES should return all pictures for readonly tier search") {
      val searchParams = SearchParams(tier = ReadOnly, uploadedBy = Some(testUser))
      val searchResult = ES.search(searchParams)
      whenReady(searchResult) { result =>
        result.total shouldBe 8
      }
    }
  }

  override def afterAll {
    Await.ready(cleanTestUserImages(), 2.seconds)
    DateTimeUtils.setCurrentMillisSystem()
  }
}
