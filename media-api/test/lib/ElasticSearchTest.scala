package lib

import com.gu.mediaservice.lib.auth.{Internal, ReadOnly, Syndication}
import com.gu.mediaservice.model.{Handout, Image, StaffPhotographer}
import controllers.SearchParams
import model._
import org.joda.time.{DateTime, DateTimeUtils}
import org.scalatest.concurrent.PatienceConfiguration.{Interval, Timeout}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Seconds, Span}
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._

class ElasticSearchTest extends FunSpec with BeforeAndAfterAll with Matchers with ElasticSearchHelper with ScalaFutures {
  val interval = Interval(Span(5, Seconds))
  val timeout = Timeout(Span(30, Seconds))

  lazy val images: List[Image] = List(
    createImage(Handout()),
    createImage(StaffPhotographer("Yellow Giraffe", "The Guardian")),
    createImage(Handout(), usages = List(createDigitalUsage())),

    // available for syndication
    createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-01-01T00:00:00")), Some(true), Some("test-image-1")),

    // has a digital usage, still eligible for syndication
    createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-01-01T00:00:00")), Some(true), Some("test-image-2"), List(createDigitalUsage())),

    // has syndication usage, not available for syndication
    createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-01-01T00:00:00")), Some(true), None, List(createDigitalUsage(), createSyndicationUsage())),

    // rights acquired, explicit allow syndication lease and unknown publish date, available for syndication
    createImageForSyndication(rightsAcquired = true, None, Some(true), Some("test-image-3")),

    // explicit deny syndication lease, not available for syndication
    createImageForSyndication(rightsAcquired = true, None, Some(false)),
    createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-01-01T00:00:00")), Some(false)),

    // images published after "today", not available for syndication
    createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-07-02T00:00:00")), Some(true)),
    createImageForSyndication(rightsAcquired = true, Some(DateTime.parse("2018-07-03T00:00:00")), Some(false)),

    // no rights acquired, not available for syndication
    createImageForSyndication(rightsAcquired = false, None, None)
  )

  override def beforeAll {
    ES.ensureAliasAssigned()
    Await.ready(saveImages(images), 1.minute)

    // allow the cluster to distribute documents... eventual consistency!
    Thread.sleep(5000)

    // mocks `DateTime.now`
    val startDate = DateTime.parse("2018-03-01")
    DateTimeUtils.setCurrentMillisFixed(startDate.getMillis)
  }

  describe("Tiered API access") {
    it("ES should return only rights acquired pictures with an allow syndication lease for a syndication tier search") {
      val searchParams = SearchParams(tier = Syndication)
      val searchResult = ES.search(searchParams)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 3

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe 3
        imageIds.contains("test-image-1") shouldBe true
        imageIds.contains("test-image-2") shouldBe true
        imageIds.contains("test-image-3") shouldBe true
      }
    }

    it("ES should return all pictures for internal tier search") {
      val searchParams = SearchParams(tier = Internal)
      val searchResult = ES.search(searchParams)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe images.size
      }
    }

    it("ES should return all pictures for readonly tier search") {
      val searchParams = SearchParams(tier = ReadOnly)
      val searchResult = ES.search(searchParams)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe images.size
      }
    }
  }

  describe("syndicationStatus query") {
    it("should return 0 results if a syndication tier specifies a SentForSyndication syndicationStatus") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(SentForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 0
      }
    }

    it("should return 3 results if a syndication tier specifies a QueuedForSyndication syndicationStatus") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(QueuedForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 3

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe 3
        imageIds.contains("test-image-1") shouldBe true
        imageIds.contains("test-image-2") shouldBe true
        imageIds.contains("test-image-3") shouldBe true
      }
    }

    it("should return 0 results if a syndication tier specifies a BlockedForSyndication syndicationStatus") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(BlockedForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 0
      }
    }

    it("should return 0 results if a syndication tier specifies a AwaitingReviewForSyndication syndicationStatus") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(AwaitingReviewForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 0
      }
    }
  }

  override def afterAll  {
    Await.ready(deleteImages(), 5.seconds)
    DateTimeUtils.setCurrentMillisSystem()
  }
}
