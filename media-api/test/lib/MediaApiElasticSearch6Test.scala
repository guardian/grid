package lib

import com.gu.mediaservice.lib.auth.{Internal, ReadOnly, Syndication}
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http._
import lib.elasticsearch.SearchParams
import lib.elasticsearch.impls.elasticsearch6.ElasticSearch
import net.logstash.logback.marker.LogstashMarker
import net.logstash.logback.marker.Markers.appendEntries
import org.joda.time.{DateTime, DateTimeUtils}
import org.scalatest.concurrent.Eventually
import play.api.libs.json.Json
import play.api.{Configuration, Logger, MarkerContext}

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.util.{Failure, Success}

class MediaApiElasticSearch6Test extends ElasticSearchTestBase with Eventually {

  private val index = "images"
  private val client = ElasticClient(ElasticProperties("http://" + "localhost" + ":" + 9206)) // TODO obtain from ES6 instance

  private val mediaApiConfig = new MediaApiConfig(Configuration.from(Map(
    "es.cluster" -> "media-service-test",
    "es.port" -> "9206",
    "persistence.identifier" -> "picdarUrn",
    "es.index.aliases.read" -> "readAlias")))

  private val mediaApiMetrics = new MediaApiMetrics(mediaApiConfig)

  private val ES = new ElasticSearch(mediaApiConfig, mediaApiMetrics)

  private val expectedNumberOfImages = images.size

  private val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  private val fiveSeconds = Duration(10, SECONDS)

  override def beforeAll {
    ES.ensureAliasAssigned()
    purgeTestImages

    Await.ready(saveImages(images), 1.minute)
    // allow the cluster to distribute documents... eventual consistency!
    eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe expectedNumberOfImages)

    // mocks `DateTime.now`
    val startDate = DateTime.parse("2018-03-01")
    DateTimeUtils.setCurrentMillisFixed(startDate.getMillis)
  }

  override def afterAll  {
    purgeTestImages
    DateTimeUtils.setCurrentMillisSystem()
  }

  describe("Native elastic search sanity checks") {

    def eventualMatchAllSearchResponse = client.execute (ElasticDsl.search(index) size expectedNumberOfImages * 2)

    it("images are actually persisted in Elastic search") {
      val searchResponse = Await.result(eventualMatchAllSearchResponse, fiveSeconds)

      searchResponse.result.totalHits shouldBe expectedNumberOfImages
      searchResponse.result.hits.size shouldBe expectedNumberOfImages
    }

    it("image hits read back from Elastic search can be parsed as images") {
      val searchResponse = Await.result(eventualMatchAllSearchResponse, fiveSeconds)

      val reloadedImages = searchResponse.result.hits.hits.flatMap(h => Json.parse(h.sourceAsString).validate[Image].asOpt)

      reloadedImages.size shouldBe expectedNumberOfImages
    }

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
        imageIds.contains("test-image-4") shouldBe true
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

  describe("syndicationStatus query on the Syndication tier") {
    it("should return 0 results if a Syndication tier queries for SentForSyndication images") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(SentForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 0
      }
    }

    it("should return 3 results if a Syndication tier queries for QueuedForSyndication images") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(QueuedForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 3

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe 3
        imageIds.contains("test-image-1") shouldBe true
        imageIds.contains("test-image-2") shouldBe true
        imageIds.contains("test-image-4") shouldBe true
      }
    }

    it("should return 0 results if a Syndication tier queries for BlockedForSyndication images") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(BlockedForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 0
      }
    }

    it("should return 0 results if a Syndication tier queries for AwaitingReviewForSyndication images") {
      val search = SearchParams(tier = Syndication, syndicationStatus = Some(AwaitingReviewForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 0
      }
    }
  }

  describe("syndicationStatus query on the internal tier") {
    it("should return 1 image if an Internal tier queries for SentForSyndication images") {
      val search = SearchParams(tier = Internal, syndicationStatus = Some(SentForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 1
      }
    }

    it("should return 3 images if an Internal tier queries for QueuedForSyndication images") {
      val search = SearchParams(tier = Internal, syndicationStatus = Some(QueuedForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 3
      }
    }

    it("should return 3 images if an Internal tier queries for BlockedForSyndication images") {
      val search = SearchParams(tier = Internal, syndicationStatus = Some(BlockedForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 3
      }
    }

    it("should return 2 images if an Internal tier queries for AwaitingReviewForSyndication images") {
      // Elastic1 implementation is returning the images with reviewed and blocked syndicationStatus
      val search = SearchParams(tier = Internal, syndicationStatus = Some(AwaitingReviewForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 2
      }
    }
  }

  private def saveImages(images: Seq[Image]) = {
    Future.sequence(images.map { i =>
      executeAndLog(indexInto(index, "_doc") id i.id source Json.stringify(Json.toJson(i)), s"Indexing test image")
    })
  }

  private def deleteImages() = {
    val deleteAllRequest = deleteByQuery(index, "_doc", matchAllQuery())
    executeAndLog(deleteAllRequest, s"Deleting images")
  }

  def executeAndLog[T, U](request: T, message: String)(implicit
                                                       functor: Functor[Future],
                                                       executor: Executor[Future],
                                                       handler: Handler[T, U],
                                                       manifest: Manifest[U]): Future[Response[U]] = {
    val start = System.currentTimeMillis()

    val result = client.execute(request).transform {
      case Success(r) =>
        r.isSuccess match {
          case true => Success(r)
          case false => Failure(new RuntimeException("query response was not successful: " + r.error.reason))
        }
      case Failure(f) => Failure(f)
    }

    result.foreach { r =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      Logger.info(s"$message - query returned successfully in $elapsed ms")(markers)
    }

    result.failed.foreach { e =>
      val elapsed = System.currentTimeMillis() - start
      val markers = MarkerContext(durationMarker(elapsed))
      Logger.error(s"$message - query failed after $elapsed ms: ${e.getMessage} cs: ${e.getCause}")(markers)
    }

    result
  }

  private def durationMarker(elapsed: Long): LogstashMarker = appendEntries(Map("duration" -> elapsed).asJava)

  private def totalImages: Long = Await.result(ES.totalImages(), oneHundredMilliseconds)

  private def purgeTestImages = {
    Await.result(deleteImages(), fiveSeconds)
    eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe 0)
  }

}
