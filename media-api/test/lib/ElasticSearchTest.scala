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

        // available for syndication
        createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-01-01T00:00:00")), Some(true)),

        // rights acquired, explicit allow syndication lease but unknown publish date, not available for syndication
        createImageForSyndication(rightsAcquired = true, None, Some(true)),

        // explicit deny syndication lease, not available for syndication
        createImageForSyndication(rightsAcquired = true, None, Some(false)),
        createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-01-01T00:00:00")), Some(false)),

        // images published after "today", not available for syndication
        createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-07-02T00:00:00")), Some(true)),
        createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-07-03T00:00:00")), Some(false)),

        // no rights acquired, not available for syndication
        createImageForSyndication(rightsAcquired = false, None, None),

        createExampleImage()
      ).map(saveToES))
    Await.ready(createTestImages, 5.seconds)

    // mocks `DateTime.now`
    val startDate = DateTime.parse("2018-03-01")
    DateTimeUtils.setCurrentMillisFixed(startDate.getMillis)
  }

  describe("ES") {
    it("ES should return only rights acquired pictures with an allow syndication lease for a syndication tier search and filter out example image") {
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
        result.total shouldBe 11
      }
    }

    it("ES should return all pictures for readonly tier search") {
      val searchParams = SearchParams(tier = ReadOnly, uploadedBy = Some(testUser))
      val searchResult = ES.search(searchParams)
      whenReady(searchResult) { result =>
        result.total shouldBe 11
      }
    }
  }

  override def afterAll {
    Await.ready(cleanTestUserImages(), 2.seconds)
    DateTimeUtils.setCurrentMillisSystem()
  }
}
