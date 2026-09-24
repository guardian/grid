package lib.elasticsearch

import org.apache.pekko.actor.{ActorSystem, Scheduler}
import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.{Internal, ReadOnly, Syndication, Tier}
import com.gu.mediaservice.lib.argo.model.{Action, Link}
import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig, ElasticSearchExecutions}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.DenySyndicationLease
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus, RemovedUsageStatus, SyndicationUsage, UnknownUsageStatus, ComposerUsageReference, DigitalUsage, FrontUsageReference, InDesignUsageReference, PrintUsage}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.Index
import com.sksamuel.elastic4s.requests.common.Shards
import com.sksamuel.elastic4s.requests.searches.{Pit, SearchBodyBuilderFn, SearchHits, SearchResponse, Total}
import com.sksamuel.elastic4s.requests.searches.sort.SortOrder
import lib.querysyntax._
import lib.{ImageResponse, MediaApiConfig, MediaApiMetrics}
import org.mockito.ArgumentMatchers.{any, anyBoolean}
import org.mockito.Mockito.when
import org.joda.time.DateTime
import org.scalatest.concurrent.Eventually
import org.scalatestplus.mockito.MockitoSugar
import play.api.Configuration
import play.api.inject.ApplicationLifecycle
import play.api.http.HttpEntity
import play.api.libs.json.{JsNull, JsNumber, JsObject, JsString, JsValue, Json}
import play.api.mvc.{AnyContent, Result}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.test.FakeRequest

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.concurrent.ExecutionContext.Implicits.global

class ElasticSearchTest extends ElasticSearchTestBase with Eventually with ElasticSearchExecutions with MockitoSugar with controllers.MediaApiTestSupport {

  implicit val request: AuthenticatedRequest[AnyContent, Principal] = mock[AuthenticatedRequest[AnyContent, Principal]]

  private val index = "images"

  private val applicationLifecycle = new ApplicationLifecycle {
    override def addStopHook(hook: () => Future[_]): Unit = {}
    override def stop(): Future[_] = Future.successful(())
  }

  private val mediaApiConfig = new MediaApiConfig(GridConfigResources(
    Configuration.from(USED_CONFIGS_IN_TEST ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap),
    null,
    applicationLifecycle
  ))
  private val actorSystem: ActorSystem = ActorSystem()
  private val mediaApiMetrics = new MediaApiMetrics(mediaApiConfig, actorSystem, applicationLifecycle)
  val elasticConfig = ElasticSearchConfig(
    aliases = ElasticSearchAliases(
      current = "Images_Current",
      migration = "Images_Migration"
    ),
    url = esTestUrl,
    shards = 1,
    replicas = 0
  )


  private lazy val ES = new ElasticSearch(mediaApiConfig, mediaApiMetrics, elasticConfig, () => List.empty, mock[Scheduler])
  lazy val client = ES.client

  // A second media-api config + ES instance whose field aliases point INTO fileMetadata, used to
  // exercise the search-after partial-fileMetadata strip (resolveSearchAfterHit). Reads the same
  // index already populated in beforeAll via `ES`. The alias paths below match leaves present on
  // the indexed test-image-8 fixture.
  private val mediaApiConfigWithFieldAliases = new MediaApiConfig(GridConfigResources(
    Configuration.from(USED_CONFIGS_IN_TEST ++ Map(
      "field.aliases" -> List(
        Map(
          "elasticsearchPath" -> "fileMetadata.xmp.org:ProgrammeMaker",
          "alias" -> "orgProgrammeMaker",
          "label" -> "Organization Programme Maker",
          "displaySearchHint" -> false
        ),
        Map(
          "elasticsearchPath" -> "fileMetadata.iptc.Caption Writer/Editor",
          "alias" -> "captionWriter",
          "label" -> "Caption Writer / Editor",
          "displaySearchHint" -> true
        )
      )
    ) ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap),
    null,
    applicationLifecycle
  ))

  private lazy val ESWithFieldAliases =
    new ElasticSearch(mediaApiConfigWithFieldAliases, mediaApiMetrics, elasticConfig, () => List.empty, mock[Scheduler])

  // A third instance with the syndication review-queue runtime-fields fix enabled, so the
  // search-after path can be compared against search() with the runtime mapping in play.
  private val mediaApiConfigWithRuntimeFieldsFix = new MediaApiConfig(GridConfigResources(
    Configuration.from(USED_CONFIGS_IN_TEST ++ Map(
      "syndication.review.useRuntimeFieldsFix" -> true
    ) ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap),
    null,
    applicationLifecycle
  ))

  private lazy val ESWithRuntimeFieldsFix =
    new ElasticSearch(mediaApiConfigWithRuntimeFieldsFix, mediaApiMetrics, elasticConfig, () => List.empty, mock[Scheduler])

  private val expectedNumberOfImages = images.size

  private val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  private val fiveSeconds = Duration(5, SECONDS)

  override def beforeAll(): Unit = {
    super.beforeAll()

    ES.ensureIndexExistsAndAliasAssigned()
    purgeTestImages

    Await.ready(saveImages(images), 1.minute)
    // allow the cluster to distribute documents... eventual consistency!
    eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe expectedNumberOfImages)
  }

  override def afterAll(): Unit = purgeTestImages

  describe("Native elastic search sanity checks") {

    def eventualMatchAllSearchResponse = client.execute(ElasticDsl.search(index) size expectedNumberOfImages * 2)

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

  describe("get by id") {
    it("can load a single image by id") {
      val expectedImage = images.head
      implicit val logMarker: LogMarker = MarkerMap()

      whenReady(ES.getImageById(expectedImage.id)) { r =>
        r.get.id shouldEqual expectedImage.id
      }
    }
  }

  describe("persistence") {
    it("should not persist unedited or unused images") {
      val searchParams = SearchParams(
        tier = Internal,
        length = 100,
        until = Some(DateTime.now.minusDays(20)),
        persisted = Some(false)
      )

      val searchResult = ES.search(searchParams)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 1

        val imageId = result.hits.map(_._1)
        imageId.size shouldBe 1
        imageId.contains("test-image-14-unedited") shouldBe true
      }
    }

    it("should persist edited or used images") {
      val searchParams = SearchParams(
        tier = Internal,
        length = 100,
        until = Some(DateTime.now.minusDays(20)),
        persisted = Some(true)
      )

      val searchResult = ES.search(searchParams)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 2

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe 2
        imageIds.contains("persisted-because-edited") shouldBe true
        imageIds.contains("persisted-because-usage") shouldBe true
      }
    }
  }

  describe("usages for supplier") {
    it("can count published agency images within the last number of days") {
      implicit val logMarker: LogMarker = MarkerMap()

      val publishedAgencyImages = images.filter(i => i.usageRights.isInstanceOf[Agency] && i.usages.exists(_.status == PublishedUsageStatus))
      publishedAgencyImages.size shouldBe 7

      // Reporting date range is implemented as round down to last full day
      val withinReportedDateRange = publishedAgencyImages.filter(i => i.usages.
        exists(u => u.dateAdded.exists(_.isBefore(DateTime.now.withTimeAtStartOfDay()))))
      withinReportedDateRange.size shouldBe 6

      val results = Await.result(ES.usageForSupplier("ACME", 5), fiveSeconds)

      results.count shouldBe 1
    }
  }

  // Saves images for a single quota test and deletes them by ID afterwards, leaving the
  // shared image set (loaded in beforeAll) untouched.
  private def withQuotaImages[A](images: Seq[Image])(test: => A): A = {
    implicit val logMarker: LogMarker = MarkerMap()
    Await.ready(saveImages(images), 1.minute)
    eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe expectedNumberOfImages + images.size)
    try test finally {
      val deletes = images.map(i => executeAndLog(deleteById(index, i.id), s"Deleting quota test image ${i.id}"))
      Await.ready(Future.sequence(deletes), fiveSeconds)
      eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe expectedNumberOfImages)
    }
  }

  describe("quotaCountBySupplier") {
    // "quota-agency" is not in Agencies.all so Agencies.get("quota-agency").supplier falls back to "quota-agency"
    val supplier = "quota-agency"
    val inRange  = DateTime.now.minusDays(15)
    val numDays  = 30

    it("counts a single composer usage as 1") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-composer-1", Agency(supplier),
        usages = List(createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange))))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 1
      }
    }

    it("counts multiple composer usages on the same image individually") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-composer-2", Agency(supplier),
        usages = List(
          createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange),
          createUsage(ComposerUsageReference, DigitalUsage, UnknownUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 2
      }
    }

    it("counts multiple fronts usages on the same image as 1") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-fronts-multi", Agency(supplier),
        usages = List(
          createUsage(FrontUsageReference, DigitalUsage, PublishedUsageStatus, inRange),
          createUsage(FrontUsageReference, DigitalUsage, RemovedUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 1
      }
    }

    it("counts each qualifying print usage individually") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-print-multi", Agency(supplier),
        usages = List(
          createUsage(InDesignUsageReference, PrintUsage, PublishedUsageStatus, inRange),
          createUsage(InDesignUsageReference, PrintUsage, RemovedUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 2
      }
    }

    it("composer precedence: only counts composer usages when an image has both composer and fronts usages") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-composer-and-fronts", Agency(supplier),
        usages = List(
          createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange),
          createUsage(FrontUsageReference, DigitalUsage, PublishedUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        // fronts usage must not be counted — if it were, result would be 2
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 1
      }
    }

    it("composer precedence: only counts composer usages when an image has both composer and print usages") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-composer-and-print", Agency(supplier),
        usages = List(
          createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange),
          createUsage(InDesignUsageReference, PrintUsage, PublishedUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        // print usage must not be counted — if it were, result would be 2
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 1
      }
    }

    it("counts both fronts (as 1) and print (per usage) when there are no composer usages") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-fronts-and-print", Agency(supplier),
        usages = List(
          createUsage(FrontUsageReference, DigitalUsage, PublishedUsageStatus, inRange),
          createUsage(InDesignUsageReference, PrintUsage, PublishedUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 2
      }
    }

    it("returns 0 when all usages are outside the date range") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-out-of-range", Agency(supplier),
        usages = List(createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, DateTime.now.minusDays(31)))))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 0
      }
    }

    it("excludes usages with a non-qualifying status") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-pending-status", Agency(supplier),
        usages = List(createUsage(ComposerUsageReference, DigitalUsage, PendingUsageStatus, inRange))))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 0
      }
    }

    it("excludes usages with a non-qualifying platform") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-syndication-platform", Agency(supplier),
        usages = List(createUsage(ComposerUsageReference, SyndicationUsage, PublishedUsageStatus, inRange))))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 0
      }
    }

    it("excludes images belonging to a different supplier") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-wrong-supplier", Agency("completely-different-agency"),
        usages = List(createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange))))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 0
      }
    }

    it("includes Composite images matched via the usageRights.suppliers field") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-composite", Composite(s"$supplier, other-supplier"),
        usages = List(createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange))))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 1
      }
    }

    it("qualifies all three counting statuses: published, unknown, and removed") {
      implicit val logMarker: LogMarker = MarkerMap()
      val images = Seq(createImage("qc-all-statuses", Agency(supplier),
        usages = List(
          createUsage(ComposerUsageReference, DigitalUsage, PublishedUsageStatus, inRange),
          createUsage(ComposerUsageReference, DigitalUsage, UnknownUsageStatus, inRange),
          createUsage(ComposerUsageReference, DigitalUsage, RemovedUsageStatus, inRange)
        )))
      withQuotaImages(images) {
        Await.result(ES.quotaCountBySupplier(supplier, numDays), fiveSeconds).count shouldBe 3
      }
    }
  }

  describe("images usages by supplier") {
    it("only returns images with a qualifying usage status/platform for the given supplier, with the full usages list and supplier populated per item") {
      implicit val logMarker: LogMarker = MarkerMap()

      val expectedIds = Set(
        "usages-by-supplier-qualified-published-digital",
        "usages-by-supplier-qualified-unknown-print",
        "usages-by-supplier-qualified-removed-digital",
        "usages-by-supplier-multi-usage",
        "usages-by-supplier-out-of-date-range",
        "usages-by-supplier-composite"
      )

      val result = Await.result(ES.imageUsagesBySupplier("test-wire", length = 100), fiveSeconds)

      result.total shouldBe expectedIds.size
      result.images.map(_.id).toSet shouldBe expectedIds
      result.images.filterNot(_.id == "usages-by-supplier-composite").foreach(_.supplier shouldBe "test-wire")

      // wrong supplier, non-qualifying status and non-qualifying platform are all excluded
      result.images.map(_.id) should not contain "usages-by-supplier-wrong-supplier"
      result.images.map(_.id) should not contain "usages-by-supplier-non-qualifying-status"
      result.images.map(_.id) should not contain "usages-by-supplier-non-qualifying-platform"

      // distinctBy(_.id) collapses multiple qualifying usages into one result. Only the qualifying
      // usages should be returned - the non-qualifying (pending status) usage on this image is excluded.
      val multiUsageResult = result.images.find(_.id == "usages-by-supplier-multi-usage").get
      multiUsageResult.usages should have size 2
      multiUsageResult.usages.map(_.status) should contain theSameElementsAs List(PublishedUsageStatus, RemovedUsageStatus)
    }

    it("only returns usages within the requested date range on a matching image, excluding out-of-range usages on the same image") {
      implicit val logMarker: LogMarker = MarkerMap()

      val dateRangeQuery = List(Nested(
        SingleField("usages"),
        SingleField("dateAdded"),
        DateRange(DateTime.parse("2020-06-20"), DateTime.parse("2020-06-30"))
      ))

      // the multi-usage image has one qualifying usage in range (2020-06-25, removed/print) and
      // one qualifying usage out of range (2020-06-01, published/digital) - only the in-range one should be returned.
      val result = Await.result(ES.imageUsagesBySupplier("test-wire", dateRangeQuery, length = 100), fiveSeconds)

      val multiUsageResult = result.images.find(_.id == "usages-by-supplier-multi-usage").get
      multiUsageResult.usages should have size 1
      multiUsageResult.usages.head.status shouldBe RemovedUsageStatus
    }

    it("applies an inclusive date range filter on usages.dateAdded and paginates the results") {
      implicit val logMarker: LogMarker = MarkerMap()

      val dateRangeQuery = List(Nested(
        SingleField("usages"),
        SingleField("dateAdded"),
        DateRange(DateTime.parse("2020-06-01"), DateTime.parse("2020-06-30"))
      ))

      val filteredResult = Await.result(ES.imageUsagesBySupplier("test-wire", dateRangeQuery, length = 100), fiveSeconds)
      filteredResult.images.map(_.id).toSet shouldBe Set(
        "usages-by-supplier-qualified-published-digital",
        "usages-by-supplier-qualified-unknown-print",
        "usages-by-supplier-qualified-removed-digital",
        "usages-by-supplier-multi-usage",
        "usages-by-supplier-composite"
      )

      // pagination: paging through with a small length shouldn't drop or duplicate results
      val pageSize = 2
      val pages = (0 until 3).map { page =>
        Await.result(ES.imageUsagesBySupplier("test-wire", offset = page * pageSize, length = pageSize), fiveSeconds)
      }
      pages.map(_.images.size) shouldBe Seq(2, 2, 2)
      pages.foreach(_.total shouldBe 6)
      pages.flatMap(_.images.map(_.id)).toSet shouldBe Set(
        "usages-by-supplier-qualified-published-digital",
        "usages-by-supplier-qualified-unknown-print",
        "usages-by-supplier-qualified-removed-digital",
        "usages-by-supplier-multi-usage",
        "usages-by-supplier-out-of-date-range",
        "usages-by-supplier-composite"
      )
    }

    it("includes composite images whose suppliers field contains the given supplier name") {
      implicit val logMarker: LogMarker = MarkerMap()

      val result = Await.result(ES.imageUsagesBySupplier("test-wire", length = 100), fiveSeconds)

      val compositeResult = result.images.find(_.id == "usages-by-supplier-composite")
      compositeResult shouldBe defined
      // supplier field is populated from usageRights.suppliers for composite images
      compositeResult.get.supplier shouldBe "test-wire, other-supplier"
    }
  }

  describe("aggregations") {
    it("can load date aggregations") {
      implicit val logMarker: LogMarker = MarkerMap()

      val aggregateSearchParams = AggregateSearchParams(field = "uploadTime", q = None, structuredQuery = List.empty)

      val results = Await.result(ES.dateHistogramAggregate(aggregateSearchParams), fiveSeconds)

      results.total shouldBe 2
      results.results.foldLeft(0: Long)((a, b) => a + b.count) shouldBe images.size
    }

    it("can load metadata aggregations") {
      implicit val logMarker: LogMarker = MarkerMap()

      val aggregateSearchParams = AggregateSearchParams(field = "keywords", q = None, structuredQuery = List.empty)

      val results = Await.result(ES.metadataSearch(aggregateSearchParams), fiveSeconds)

      results.total shouldBe 2
      results.results.find(b => b.key == "es").get.count shouldBe images.size
      results.results.find(b => b.key == "test").get.count shouldBe images.size
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
        result.hits.forall(h => h._2.instance.leases.leases.nonEmpty) shouldBe true
        result.hits.forall(h => h._2.instance.leases.leases.forall(l => l.access == DenySyndicationLease)) shouldBe true
        result.total shouldBe 3
      }
    }

    it("should return 3 images if an Internal tier queries for AwaitingReviewForSyndication images") {
      // Elastic1 implementation is returning the images with reviewed and blocked syndicationStatus
      val search = SearchParams(tier = Internal, syndicationStatus = Some(AwaitingReviewForSyndication))
      val searchResult = ES.search(search)
      whenReady(searchResult, timeout, interval) { result =>
        result.total shouldBe 3
      }
    }
  }

  describe("has field filter") {
    it("can filter images which have a specific field") {
      val hasTitleCondition = Match(HasField, HasValue("title"))
      val unknownFieldCondition = Match(HasField, HasValue("unknownfield"))

      val hasTitleSearch = SearchParams(tier = Internal, structuredQuery = List(hasTitleCondition))
      whenReady(ES.search(hasTitleSearch), timeout, interval) { result =>
        result.total shouldBe expectedNumberOfImages
      }

      val hasUnknownFieldTitleSearch = SearchParams(tier = Internal, structuredQuery = List(unknownFieldCondition))
      whenReady(ES.search(hasUnknownFieldTitleSearch), timeout, interval) { result =>
        result.total shouldBe 0
      }
    }

    it("should be able to filter images with fileMetadata even though fileMetadata fields are not indexed") {
      val hasFileMetadataCondition = Match(HasField, HasValue("fileMetadata"))
      val hasFileMetadataSearch = SearchParams(tier = Internal, structuredQuery = List(hasFileMetadataCondition))
      whenReady(ES.search(hasFileMetadataSearch), timeout, interval) { result =>
        // test-image-8 (multi-key xmp) and graphic-image-1 (pur:adultContentWarning) both have xmp content
        result.total shouldBe 2
        result.hits.forall(_._2.instance.fileMetadata.xmp.nonEmpty) shouldBe true
      }
    }

    it("should be able to filter images which have specific fileMetadata fields even though fileMetadata fields are not indexed") {
      val hasFileMetadataCondition = Match(HasField, HasValue("fileMetadata.xmp.foo"))
      val hasFileMetadataSearch = SearchParams(tier = Internal, structuredQuery = List(hasFileMetadataCondition))
      whenReady(ES.search(hasFileMetadataSearch), timeout, interval) { result =>
        result.total shouldBe 1
        result.hits.head._2.instance.fileMetadata.xmp.get("foo") shouldBe Some(JsString("bar"))
      }
    }

    it("file metadata files which are too long cannot by persisted as keywords and will not contribute to has field search results") {
      val hasFileMetadataCondition = Match(HasField, HasValue("fileMetadata.xmp.toolong"))
      val hasFileMetadataSearch = SearchParams(tier = Internal, structuredQuery = List(hasFileMetadataCondition))
      whenReady(ES.search(hasFileMetadataSearch), timeout, interval) { result =>
        result.total shouldBe 0
      }
    }
  }

  describe("is field filter") {
    it("should return no images with an invalid search") {
      val search = SearchParams(tier = Internal, structuredQuery = List(isInvalidCondition))
      whenReady(ES.search(search), timeout, interval) { result => {
        result.total shouldBe 0
      }
      }
    }

    it("should return owned photographs") {
      val search = SearchParams(tier = Internal, structuredQuery = List(isOwnedPhotoCondition), length = 50)
      whenReady(ES.search(search), timeout, interval) { result => {
        val expected = List(
          "iron-suit",
          "green-leaf",
          "test-image-1",
          "test-image-2",
          "test-image-3",
          "test-image-4",
          "test-image-5",
          "test-image-6",
          "test-image-7",
          "test-image-8",
          "test-image-12",
          "test-image-13"
        )

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe expected.size
        expected.foreach(imageIds.contains(_) shouldBe true)
      }
      }
    }

    it("should return owned illustrations") {
      val search = SearchParams(tier = Internal, structuredQuery = List(isOwnedIllustrationCondition))
      whenReady(ES.search(search), timeout, interval) { result => {
        val expected = List(
          "green-giant",
          "hammer-hammer-hammer"
        )

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe expected.size
        expected.foreach(imageIds.contains(_) shouldBe true)
      }
      }
    }

    it("should return all owned images") {
      val search = SearchParams(tier = Internal, structuredQuery = List(isOwnedImageCondition), length = 50)
      whenReady(ES.search(search), timeout, interval) { result => {
        val expected = List(
          "iron-suit",
          "green-leaf",
          "test-image-1",
          "test-image-2",
          "test-image-3",
          "test-image-4",
          "test-image-5",
          "test-image-6",
          "test-image-7",
          "test-image-8",
          "test-image-12",
          "test-image-13",
          "green-giant",
          "hammer-hammer-hammer"
        )

        val imageIds = result.hits.map(_._1)
        imageIds.size shouldBe expected.size
        expected.foreach(imageIds.contains(_) shouldBe true)
      }
      }
    }

    it("should return all images when no agencies are over quota") {
      val search = SearchParams(tier = Internal, structuredQuery = List(isUnderQuotaCondition))

      whenReady(ES.search(search), timeout, interval) { result => {
        result.total shouldBe images.size
      }
      }
    }

    it("should return any image whose agency is not over quota") {
      def overQuotaAgencies = List(Agency("Getty Images"), Agency("AP"))

      val search = SearchParams(tier = Internal, structuredQuery = List(isUnderQuotaCondition), length = 50)
      val elasticsearch = new ElasticSearch(mediaApiConfig, mediaApiMetrics, elasticConfig, () => overQuotaAgencies, mock[Scheduler])

      whenReady(elasticsearch.search(search), timeout, interval) { result => {
        val overQuotaImages = List(
          "getty-image-1",
          "getty-image-2",
          "ap-image-1"
        )
        val expectedUnderQuotaImages = images.map(_.id).filterNot(overQuotaImages.contains)
        result.total shouldBe expectedUnderQuotaImages.size
        val imageIds = result.hits.map(_._1)
        expectedUnderQuotaImages.foreach(imageIds.contains(_) shouldBe true)
      }
      }
    }
  }

  describe("dateAddedToCollection sort (Kahuna search path)") {
    // Guards the production search() sort-match case for the "-dateAddedToCollection" (ascending)
    // token. Without it, "-dateAddedToCollection" falls through to parseSortBy → fieldSort on an
    // unmapped field with no unmappedType → ES error. The ascending sort def carries unmappedType,
    // so the search succeeds even though no test image has a collection. This is a Kahuna-only
    // capability (kupua sorts via its own client-sent clause through searchAfter).
    it("accepts the -dateAddedToCollection (ascending) token without erroring") {
      val search = SearchParams(tier = Internal, orderBy = Some("-dateAddedToCollection"))
      whenReady(ES.search(search), timeout, interval) { result =>
        result.total shouldBe expectedNumberOfImages
      }
    }

    it("accepts the dateAddedToCollection (descending) token without erroring") {
      val search = SearchParams(tier = Internal, orderBy = Some("dateAddedToCollection"))
      whenReady(ES.search(search), timeout, interval) { result =>
        result.total shouldBe expectedNumberOfImages
      }
    }
  }

  describe("GET/D3 contracts") {
    val uploader = UserPrincipal("Test", "Uploader", "uploader@example.test")
    val otherUploader = UserPrincipal("Test", "Other", "other@example.test")
    val sortClause = Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
    val writer = mock[ImageResponse]
    when(writer.create(any[String], any[SourceWrapper[Image]], anyBoolean(), anyBoolean(), anyBoolean(),
      any[List[String]], any[Tier])(any[LogMarker])).thenAnswer { invocation =>
      (Json.obj("id" -> invocation.getArgument[String](0)), List.empty[Link], List.empty[Action])
    }

    def withImages(fixtures: Seq[Image])(check: JsObject => Unit): Unit = {
      whenReady(saveImages(fixtures).flatMap(_ => client.execute(refreshIndex(index))), timeout, interval) { _ =>
        try check(Json.obj("ids" -> fixtures.map(_.id).mkString(","), "length" -> 100, "countAll" -> true))
        finally {
          whenReady(Future.sequence(fixtures.map(image => client.execute(deleteById(index, image.id))))
            .flatMap(_ => client.execute(refreshIndex(index))), timeout, interval)(_ => ())
        }
      }
    }

    def assertPage(response: Future[Result], expected: Set[String]): Unit = {
      whenReady(response, timeout, interval) { result =>
        result.header.status shouldBe 200
        val json = Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
        (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String]).toSet shouldBe expected
        (json \ "total").as[Long] shouldBe expected.size.toLong
      }
    }

    def getRequest(queryParams: (String, String)*) = {
      val query = queryParams.map { case (name, value) =>
        s"${java.net.URLEncoder.encode(name, "UTF-8")}=${java.net.URLEncoder.encode(value, "UTF-8")}"
      }.mkString("&")
      FakeRequest("GET", s"/images?$query")
    }

    def assertBothModes(body: JsObject, expected: Set[String]): Unit = {
      val controller = mediaApiFor(uploader, ES, writer, privileged = true)
      val d3 = imageQueryControllerFor(uploader, ES, writer, privileged = true)
      val queryParams = body.fields.map { case (name, value) =>
        name -> (value match {
          case JsString(text) => text
          case other => Json.stringify(other)
        })
      }
      assertPage(controller.imageSearch().apply(getRequest(queryParams.toList: _*)), expected)
      assertPage(d3.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
        .withBody(body ++ Json.obj("sort" -> sortClause))), expected)
    }

    it("scopes deleted hits and exact totals through the D3 controller and preserves GET authorization") {
      val deleted = Seq(uploader, otherUploader).map { principal =>
        createImage(s"d3-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
          softDeletedMetadata = Some(deletionData(principal.email)))
      }
      val live = createImage("d3-visible", Handout(), uploadedBy = uploader.email)
      val replaced = createImage("d3-replaced", Handout(), uploadedBy = uploader.email,
        usages = List(createUsage(ComposerUsageReference, DigitalUsage,
          com.gu.mediaservice.model.usage.ReplacedUsageStatus, DateTime.parse("2020-06-15T00:00:00Z"))))

      withImages(deleted ++ Seq(live, replaced)) { base =>
        Seq(uploader, otherUploader).foreach { principal =>
          val controller = mediaApiFor(principal, ES, writer)
          val d3 = imageQueryControllerFor(principal, ES, writer)
          Seq("is:deleted", "keyword:test is:deleted", "is:DELETED -is:deletedx", "is:\"deleted\"", "is:'deleted'").foreach { query =>
            assertPage(d3.searchAfterImages().apply(FakeRequest("POST", "/images/search-after").withBody(
              base ++ Json.obj("sort" -> sortClause, "q" -> query, "uploadedBy" -> "not-the-uploader@example.test")
            )), Set(s"d3-deleted-${principal.lastName}"))
          }
          assertPage(controller.imageSearch().apply(getRequest(
            "q" -> "is:deleted", "ids" -> deleted.map(_.id).mkString(","), "countAll" -> "true"
          )), Set(s"d3-deleted-${principal.lastName}"))
        }
        val privileged = imageQueryControllerFor(uploader, ES, writer, privileged = true)
        Seq("is:deleted", "is:\"deleted\"", "is:DELETED").foreach { query =>
          assertPage(privileged.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
            .withBody(base ++ Json.obj("sort" -> sortClause, "q" -> query))), deleted.map(_.id).toSet)
        }
        val ordinary = imageQueryControllerFor(uploader, ES, writer)
        Seq(Json.obj(), Json.obj("q" -> JsNull), Json.obj("q" -> 42), Json.obj("q" -> ""),
          Json.obj("q" -> "-is:deleted"), Json.obj("q" -> "-is:deletedx"),
          Json.obj("q" -> "-description:\"is:deleted\""), Json.obj("q" -> "fixture\tterm")).foreach { query =>
          assertPage(ordinary.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
            .withBody(base ++ Json.obj("sort" -> sortClause) ++ query)), Set(live.id))
        }
        assertPage(ordinary.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
          .withBody(base ++ Json.obj("sort" -> sortClause, "q" -> "usages@status:replaced"))), Set(replaced.id))
      }
    }

    it("retains omitted, true and false acquired-rights filters and existing mixed-rights status semantics") {
      def rights(values: List[Option[Boolean]]) = Some(SyndicationRights(None, Nil,
        values.zipWithIndex.map { case (acquired, position) => com.gu.mediaservice.model.Right(s"right-$position", acquired, Nil) }))
      val fixtures = Seq(
        createImage("d3-rights-missing", Handout()),
        createImage("d3-rights-empty", Handout(), syndicationRights = rights(Nil)),
        createImage("d3-rights-unset", Handout(), syndicationRights = rights(List(None))),
        createImage("d3-rights-false", Handout(), syndicationRights = rights(List(Some(false), Some(false)))),
        createImage("d3-rights-true", Handout(), syndicationRights = rights(List(Some(true), Some(true)))),
        createImage("d3-rights-mixed", Handout(), syndicationRights = rights(List(Some(false), Some(true)))),
      )
      val acquired = Set("d3-rights-true", "d3-rights-mixed")
      val all = fixtures.map(_.id).toSet

      withImages(fixtures) { base =>
        assertBothModes(base, all)
        assertBothModes(base ++ Json.obj("hasRightsAcquired" -> true), acquired)
        assertBothModes(base ++ Json.obj("hasRightsAcquired" -> false), all -- acquired)
        assertBothModes(base ++ Json.obj("syndicationStatus" -> "unsuitable"), all - "d3-rights-true")
      }
    }

    it("returns a D3 expiry contract for a closed PIT search context") {
      val controller = imageQueryControllerFor(uploader, ES, writer)
      val response = for {
        opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
        _ <- client.execute(deletePointInTime(opened.result.id))
        result <- controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
          .withBody(Json.obj("sort" -> sortClause, "pitId" -> opened.result.id)))
      } yield result

      whenReady(response, timeout, interval) { result =>
        result.header.status shouldBe 410
        val json = Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
        (json \ "errorKey").as[String] shouldBe "search-after-pit-expired"
      }
    }

    it("does not classify malformed PIT IDs as D3 expiry") {
      val controller = imageQueryControllerFor(uploader, ES, writer)
      val response = controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
        .withBody(Json.obj("sort" -> sortClause, "pitId" -> "not-a-pit")))

      whenReady(response.failed, timeout, interval) { error =>
        error shouldBe a[com.gu.mediaservice.lib.elasticsearch.ElasticSearchError]
      }
    }

    it("excludes equality for all six date bounds in GET and D3, including date-only UTC midnight") {
      val boundary = DateTime.parse("2020-06-15T00:00:00Z")
      val fixtures = Seq("before" -> boundary.minusMillis(1), "equal" -> boundary, "after" -> boundary.plusMillis(1))
        .map { case (position, date) =>
          val image = createImage(s"d3-date-$position", Handout())
          image.copy(uploadTime = date, lastModified = Some(date), metadata = image.metadata.copy(dateTaken = Some(date)))
        }

      withImages(fixtures) { base =>
        Seq("since", "until", "takenSince", "takenUntil", "modifiedSince", "modifiedUntil").foreach { bound =>
          val expected = Set(if (bound.toLowerCase.endsWith("since")) "d3-date-after" else "d3-date-before")
          Seq("2020-06-15T00:00:00.000Z", "2020-06-15").foreach { date =>
            assertBothModes(base ++ Json.obj(bound -> date), expected)
          }
        }
      }
    }

    describe("window") {
      implicit val logMarker: LogMarker = MarkerMap()
      val defaultSort = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val internal = SearchParams(tier = Internal)

      val t0 = DateTime.parse("2020-01-01T00:00:00Z")
      def orderingFixture(id: String, takenDay: Option[Int], uploadHour: Int, usageDays: Int*): Image = {
        val image = createImage(id, Handout(), usages = usageDays.map(day => createDigitalUsage(t0.plusDays(day))).toList)
        image.copy(uploadTime = t0.plusHours(uploadHour), metadata = image.metadata.copy(dateTaken = takenDay.map(day => t0.plusDays(day))))
      }
      // Ties on dateTaken (a, b, i) and on uploadTime within them (a, b); missing dateTaken (d, e, h);
      // ties on max usage date (b, f and a, d); images without usages (c, e, g, h).
      val orderingFixtures = Seq(
        orderingFixture("win-a", Some(3), 1, 5),
        orderingFixture("win-b", Some(3), 1, 2, 9),
        orderingFixture("win-c", Some(1), 2),
        orderingFixture("win-d", None, 1, 5),
        orderingFixture("win-e", None, 3),
        orderingFixture("win-f", Some(7), 2, 9),
        orderingFixture("win-g", Some(1), 3),
        orderingFixture("win-h", None, 2),
        orderingFixture("win-i", Some(3), 3, 2),
      )
      val orderingScope = internal.copy(ids = Some(orderingFixtures.map(_.id).toList))

      val takenDescending = Seq(Json.obj("metadata.dateTaken" -> "desc"), Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val takenAscending = Seq(Json.obj("metadata.dateTaken" -> "asc"), Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val lastUsed = Seq(
        Json.obj("usages.dateAdded" -> Json.obj("order" -> "desc", "mode" -> "max", "missing" -> "_last", "nested" -> Json.obj("path" -> "usages"))),
        Json.obj("uploadTime" -> "desc"),
        Json.obj("id" -> "asc"),
      )

      def window(searchParams: SearchParams, sort: Seq[JsObject], offset: Int, length: Int, pitId: Option[String] = None) =
        Await.result(ES.imageWindow(ImageWindowParams(searchParams.copy(offset = offset, length = length), sort, pitId)), fiveSeconds)

      // Pages the way Kupua does: each page's last tuple (null-primary in the null zone) is the next cursor.
      def d3Walk(searchParams: SearchParams, sort: Seq[JsObject]): Seq[(String, Seq[JsValue])] = {
        def walk(cursor: Option[Seq[JsValue]], acc: Seq[(String, Seq[JsValue])], pages: Int): Seq[(String, Seq[JsValue])] = {
          val page = Await.result(ES.searchAfter(SearchAfterParams(
            searchParams.copy(length = 2, countAll = Some(false)), sort, cursor, None)), fiveSeconds)
          if (page.hits.isEmpty || pages > 50) acc
          else walk(page.nextSortValues, acc ++ page.hits.map(_._1).zip(page.sortValues), pages + 1)
        }
        walk(None, Seq.empty, 0)
      }

      def pageIds(response: Future[Result]): Set[String] = whenReady(response, timeout, interval) { result =>
        result.header.status shouldBe 200
        val json = Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
        (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String]).toSet
      }

      def viaD3AndWindow(controller: controllers.ImageQueryController, body: JsObject): (Set[String], Set[String]) = (
        pageIds(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj("sort" -> sortClause)))),
        pageIds(controller.windowImages().apply(FakeRequest("POST", "/images/window").withBody(body ++ Json.obj("sort" -> sortClause)))),
      )

      Seq("dateTaken descending" -> takenDescending, "dateTaken ascending" -> takenAscending, "last used (nested max)" -> lastUsed).foreach {
        case (name, sort) =>
          it(s"returns exactly positions [k, k+n) of a D3 cursor walk, ids and tuples: $name") {
            withImages(orderingFixtures) { _ =>
              val walked = d3Walk(orderingScope, sort)
              walked.map(_._1) should contain theSameElementsAs orderingFixtures.map(_.id)
              walked.exists(_._2.head == JsNull) shouldBe true

              for {
                offset <- walked.indices
                length <- Seq(1, 3)
              } withClue(s"offset $offset, length $length: ") {
                val result = window(orderingScope, sort, offset, length)
                result.hits.map(_._1).zip(result.sortValues) shouldBe walked.slice(offset, offset + length)
              }
            }
          }
      }

      it("reports the exact total when counting, omits it otherwise, and counts raw hits") {
        withImages(orderingFixtures) { _ =>
          val counted = window(orderingScope, defaultSort, 2, 3)
          counted.total shouldBe Some(orderingFixtures.size.toLong)
          counted.rawHitCount shouldBe 3

          window(orderingScope.copy(countAll = Some(false)), defaultSort, 2, 3).total shouldBe None
        }
      }

      it("counts undecodable hits in rawHitCount instead of hiding them") {
        val undecodable = "win-undecodable"
        val saved = executeAndLog(indexInto(index) id undecodable source Json.stringify(Json.obj(
          "id" -> undecodable, "uploadTime" -> "2020-01-01T00:00:00.000Z")), "Indexing undecodable fixture")
        whenReady(saved.flatMap(_ => client.execute(refreshIndex(index))), timeout, interval)(_ => ())
        try {
          withImages(orderingFixtures.take(1)) { _ =>
            val result = window(internal.copy(ids = Some(List(undecodable, "win-a"))), defaultSort, 0, 10)
            result.rawHitCount shouldBe 2
            result.hits.map(_._1) shouldBe Seq("win-a")
            result.sortValues should have size 1
          }
        } finally {
          whenReady(client.execute(deleteById(index, undecodable)).flatMap(_ => client.execute(refreshIndex(index))), timeout, interval)(_ => ())
        }
      }

      it("serves the deepest shallow request (offset 9,999, length 200) and refuses offset 10,000") {
        window(internal, defaultSort, 9999, 200).hits shouldBe empty

        whenReady(ES.imageWindow(ImageWindowParams(internal.copy(offset = 10000, length = 1), defaultSort, None)).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message should include("offset")
        }
      }

      it("refuses an empty sort clause") {
        whenReady(ES.imageWindow(ImageWindowParams(internal.copy(length = 1), Nil, None)).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message should include("sort")
        }
      }

      it("refuses an explicit _shard_doc sort, so public tuples stay PIT-independent") {
        val shardDocSort = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("_shard_doc" -> "asc"))
        whenReady(ES.imageWindow(ImageWindowParams(internal.copy(length = 1), shardDocSort, None)).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message should include("_shard_doc")
        }
      }

      it("applies the syndication tier filter exactly as D3 does") {
        val syndication = SearchParams(tier = Syndication, length = 200)
        val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, defaultSort, None, None)), fiveSeconds)
        val viaWindow = window(syndication, defaultSort, 0, 200)

        viaD3.total should be < expectedNumberOfImages.toLong
        viaWindow.hits.map(_._1) shouldBe viaD3.hits.map(_._1)
        viaWindow.total shouldBe Some(viaD3.total)
      }

      it("honours a PIT without leaking _shard_doc into tuples") {
        withImages(orderingFixtures) { _ =>
          val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)
          val live = window(orderingScope, takenDescending, 1, 4)
          val pinned = window(orderingScope, takenDescending, 1, 4, Some(pitId))

          pinned.hits.map(_._1) shouldBe live.hits.map(_._1)
          pinned.sortValues shouldBe live.sortValues
          pinned.sortValues.foreach(_ should have length takenDescending.length.toLong)
          pinned.pitId shouldBe defined
        }
      }

      it("scopes deleted hits identically through D3 and window, for ordinary and privileged callers") {
        val deleted = Seq(uploader, otherUploader).map { principal =>
          createImage(s"win-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
            softDeletedMetadata = Some(deletionData(principal.email)))
        }
        withImages(deleted) { base =>
          Seq(uploader, otherUploader).foreach { principal =>
            val (viaD3, viaWindow) = viaD3AndWindow(imageQueryControllerFor(principal, ES, writer),
              base ++ Json.obj("q" -> "is:deleted", "uploadedBy" -> "not-the-uploader@example.test"))
            viaD3 shouldBe Set(s"win-deleted-${principal.lastName}")
            viaWindow shouldBe viaD3
          }
          val (privilegedD3, privilegedWindow) = viaD3AndWindow(imageQueryControllerFor(uploader, ES, writer, privileged = true),
            base ++ Json.obj("q" -> "is:deleted"))
          privilegedD3 shouldBe deleted.map(_.id).toSet
          privilegedWindow shouldBe privilegedD3
        }
      }

      // Agreement only for the witness: its membership (and whether the replaced default still applies
      // alongside user usage negatives) changes with #4957, so it is deliberately not asserted. The
      // default-query controls prove both paths apply the admitted query and its defaults.
      it("admits the default query and a GRID-001 witness identically through D3 and window") {
        val fixtures = Seq(
          createImage("win-usage-witness", Handout(), usages = List(createPrintUsage(), createDigitalUsage())),
          createImage("win-usage-replaced", Handout(),
            usages = List(createUsage(ComposerUsageReference, DigitalUsage, com.gu.mediaservice.model.usage.ReplacedUsageStatus, t0))),
          createImage("win-usage-none", Handout()),
        )
        withImages(fixtures) { base =>
          val controller = imageQueryControllerFor(uploader, ES, writer)
          val (defaultD3, defaultWindow) = viaD3AndWindow(controller, base)
          defaultD3 should contain("win-usage-none")
          defaultD3 should not contain "win-usage-replaced"
          defaultWindow shouldBe defaultD3

          val (witnessD3, witnessWindow) = viaD3AndWindow(controller, base ++ Json.obj("q" -> "-usages@platform:print -usages@status:published"))
          witnessWindow shouldBe witnessD3
        }
      }

      it("returns the PIT expiry contract for a closed PIT") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val response = for {
          opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
          _ <- client.execute(deletePointInTime(opened.result.id))
          result <- controller.windowImages().apply(FakeRequest("POST", "/images/window")
            .withBody(Json.obj("sort" -> sortClause, "pitId" -> opened.result.id)))
        } yield result

        whenReady(response, timeout, interval) { result =>
          result.header.status shouldBe 410
          val json = Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
          (json \ "errorKey").as[String] shouldBe "search-after-pit-expired"
        }
      }

      it("responds 422 to a start position of 10,000") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        whenReady(controller.windowImages().apply(FakeRequest("POST", "/images/window")
          .withBody(Json.obj("sort" -> sortClause, "offset" -> 10000))), timeout, interval) { result =>
          result.header.status shouldBe 422
        }
      }
    }

    describe("rank") {
      implicit val logMarker: LogMarker = MarkerMap()
      val internal = SearchParams(tier = Internal)
      val t0 = DateTime.parse("2020-01-01T00:00:00Z")

      def rankFixture(id: String, takenDay: Option[Int], uploadHour: Int, credit: Option[String], width: Int,
                      collectionDays: Seq[Int], usageDays: Seq[Int], modifiedDay: Option[Int], editStatus: Option[String]): Image = {
        val image = createImage(id, Handout(), usages = usageDays.map(day => createDigitalUsage(t0.plusDays(day))).toList,
          fileMetadata = Some(FileMetadata(iptc = editStatus.map(status => Map("Edit Status" -> status)).getOrElse(Map.empty))))
        image.copy(
          uploadTime   = t0.plusHours(uploadHour),
          lastModified = modifiedDay.map(day => t0.plusDays(day)),
          metadata     = image.metadata.copy(dateTaken = takenDay.map(day => t0.plusDays(day)), credit = credit),
          source       = image.source.copy(dimensions = Some(Dimensions(width = width, height = 600))),
          collections  = collectionDays.map(day => Collection.build(List(s"rank-$day"), ActionData("rank-test", t0.plusDays(day)))).toList,
        )
      }
      // Ties on every primary and on uploadTime within them, and a missing value for each nullable
      // primary. b and g have several usages/collections, so max-mode and any-value predicates disagree;
      // i's only usage and collection date equals b's smaller one, so max equality does too.
      // Edit status is missing both where credit is present (g, i) and where it is missing (c, e).
      val rankFixtures = Seq(
        rankFixture("rank-a", Some(3), 1, Some("AAP"),     800,  Seq(4),    Seq(5),    Some(2), Some("Original")),
        rankFixture("rank-b", Some(3), 1, Some("AAP"),     800,  Seq(2, 9), Seq(2, 9), Some(2), Some("Corrected")),
        rankFixture("rank-c", Some(1), 2, None,            1200, Nil,       Nil,       None,    None),
        rankFixture("rank-d", None,    1, Some("Reuters"), 800,  Seq(4),    Seq(5),    Some(6), Some("Original")),
        rankFixture("rank-e", None,    3, None,            400,  Nil,       Nil,       None,    None),
        rankFixture("rank-f", Some(7), 2, Some("Reuters"), 1200, Seq(9),    Seq(9),    Some(1), Some("Corrected")),
        rankFixture("rank-g", Some(1), 3, Some("AAP"),     400,  Seq(1, 3), Nil,       Some(6), None),
        rankFixture("rank-h", None,    2, Some("Getty"),   800,  Nil,       Nil,       None,    Some("Original")),
        rankFixture("rank-i", Some(3), 3, Some("Getty"),   1200, Seq(2),    Seq(2),    Some(1), None),
      )
      val rankScope = internal.copy(ids = Some(rankFixtures.map(_.id).toList))

      val id = Json.obj("id" -> "asc")
      def plain(field: String, order: String) = Json.obj(field -> order)
      def selectedMax(field: String, order: String, nestedPath: Option[String]) =
        Json.obj(field -> (Json.obj("order" -> order, "mode" -> "max", "missing" -> "_last") ++
          nestedPath.fold(Json.obj())(path => Json.obj("nested" -> Json.obj("path" -> path)))))
      val newestFirst = Seq(plain("uploadTime", "desc"), id)
      // A configured alias resolves to a fileMetadata keyword path (for example editStatus).
      val editStatus = "fileMetadata.iptc.Edit Status"

      // The clauses Kupua's buildSortClause emits for each supported order.
      val supportedSorts = Seq(
        "newest"                         -> newestFirst,
        "oldest"                         -> Seq(plain("uploadTime", "asc"), id),
        "taken descending"               -> Seq(plain("metadata.dateTaken", "desc"), plain("uploadTime", "desc"), id),
        "taken ascending"                -> Seq(plain("metadata.dateTaken", "asc"), plain("uploadTime", "asc"), id),
        "modified descending"            -> Seq(plain("lastModified", "desc"), plain("uploadTime", "desc"), id),
        "modified ascending"             -> Seq(plain("lastModified", "asc"), plain("uploadTime", "asc"), id),
        "last used descending"           -> Seq(selectedMax("usages.dateAdded", "desc", Some("usages")), plain("uploadTime", "desc"), id),
        "last used ascending"            -> Seq(selectedMax("usages.dateAdded", "asc", Some("usages")), plain("uploadTime", "asc"), id),
        "added to collection descending" -> Seq(selectedMax("collections.actionData.date", "desc", None), plain("uploadTime", "desc"), id),
        "added to collection ascending"  -> Seq(selectedMax("collections.actionData.date", "asc", None), plain("uploadTime", "asc"), id),
        "credit ascending"               -> Seq(plain("metadata.credit", "asc"), plain("uploadTime", "desc"), id),
        "credit descending"              -> Seq(plain("metadata.credit", "desc"), plain("uploadTime", "desc"), id),
        "width descending"               -> Seq(plain("source.dimensions.width", "desc"), plain("uploadTime", "desc"), id),
        "width ascending"                -> Seq(plain("source.dimensions.width", "asc"), plain("uploadTime", "desc"), id),
        "configured alias ascending"     -> Seq(plain(editStatus, "asc"), plain("uploadTime", "desc"), id),
        "configured alias descending"    -> Seq(plain(editStatus, "desc"), plain("uploadTime", "desc"), id),
        // An alias expanding to several clauses puts nulls outside the primary slot.
        "multi-clause expansion"         -> Seq(plain("metadata.credit", "asc"), plain(editStatus, "desc"), plain("uploadTime", "desc"), id),
      )
      val alwaysValuedPrimary = Set("newest", "oldest", "width descending", "width ascending")
      // Every admitted image sorts before an upload time of zero in newest-first order.
      val afterEverything = Seq[JsValue](JsNumber(0), JsString(""))

      def rank(searchParams: SearchParams, sort: Seq[JsObject], sortValues: Seq[JsValue], pitId: Option[String] = None) =
        Await.result(ES.imageRank(ImageRankParams(searchParams, sort, sortValues, pitId)), fiveSeconds)

      def windowTuples(searchParams: SearchParams, sort: Seq[JsObject]): Seq[(String, Seq[JsValue])] = {
        val page = Await.result(ES.imageWindow(ImageWindowParams(searchParams.copy(offset = 0, length = 100), sort, None)), fiveSeconds)
        page.hits.map(_._1).zip(page.sortValues)
      }

      def refusalOf(sort: Seq[JsObject], sortValues: Seq[JsValue]): String =
        whenReady(ES.imageRank(ImageRankParams(internal, sort, sortValues, None)).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message
        }

      def statusAndJson(response: Future[Result]): (Int, JsValue) = whenReady(response, timeout, interval) { result =>
        (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
      }

      supportedSorts.foreach { case (name, sort) =>
        it(s"ranks the tuple at every window position k as k: $name") {
          withImages(rankFixtures) { _ =>
            val positioned = windowTuples(rankScope, sort)
            positioned.map(_._1) should contain theSameElementsAs rankFixtures.map(_.id)
            positioned.exists(_._2.head == JsNull) shouldBe !alwaysValuedPrimary(name)
            if (name == "multi-clause expansion") {
              val leadingPairs = positioned.map(_._2.take(2))
              leadingPairs should contain(Seq(JsString("AAP"), JsNull))
              leadingPairs should contain(Seq(JsNull, JsNull))
            }

            positioned.zipWithIndex.foreach { case ((imageId, tuple), k) =>
              withClue(s"$imageId at $k with $tuple: ") {
                rank(rankScope, sort, tuple).rank shouldBe k.toLong
              }
            }
          }
        }
      }

      it("counts the images before a tuple that belongs to no image") {
        withImages(rankFixtures) { _ =>
          // Between the 1h and 2h uploads: the six images uploaded at 2h or 3h sort before it.
          rank(rankScope, newestFirst, Seq(JsNumber(t0.plusMinutes(90).getMillis), JsString("rank-"))).rank shouldBe 6L
        }
      }

      it("ranks identically under a PIT and returns it") {
        withImages(rankFixtures) { _ =>
          val sort = supportedSorts.toMap.apply("last used ascending")
          val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)

          windowTuples(rankScope, sort).zipWithIndex.foreach { case ((_, tuple), k) =>
            val pinned = rank(rankScope, sort, tuple, Some(pitId))
            pinned.rank shouldBe k.toLong
            pinned.pitId shouldBe defined
          }
        }
      }

      it("applies the syndication tier filter exactly as D3 does") {
        val syndication = SearchParams(tier = Syndication, length = 200)
        val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, newestFirst, None, None)), fiveSeconds)

        viaD3.total should be < expectedNumberOfImages.toLong
        rank(syndication, newestFirst, afterEverything).rank shouldBe viaD3.total
        rank(internal, newestFirst, afterEverything).rank shouldBe expectedNumberOfImages.toLong
      }

      it("counts within the same deleted scope as D3, for ordinary and privileged callers") {
        val deleted = Seq(uploader, otherUploader).map { principal =>
          createImage(s"rank-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
            softDeletedMetadata = Some(deletionData(principal.email)))
        }
        withImages(deleted) { base =>
          val body = base ++ Json.obj("q" -> "is:deleted", "sort" -> newestFirst)
          Seq((uploader, false, 1L), (otherUploader, false, 1L), (uploader, true, 2L)).foreach { case (principal, privileged, expected) =>
            val controller = imageQueryControllerFor(principal, ES, writer, privileged)
            val (_, d3) = statusAndJson(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after").withBody(body)))
            val (status, ranked) = statusAndJson(controller.rankImages().apply(FakeRequest("POST", "/images/rank")
              .withBody(body ++ Json.obj("sortValues" -> afterEverything))))

            status shouldBe 200
            (ranked \ "rank").as[Long] shouldBe (d3 \ "total").as[Long]
            (ranked \ "rank").as[Long] shouldBe expected
          }
        }
      }

      it("reads through a size-0 _search with an exact total, not the 10,000 default cap") {
        val body = Json.parse(SearchBodyBuilderFn(ES.imageRankRequest(ImageRankParams(internal, newestFirst, afterEverything, None))).string)
        (body \ "size").as[Int] shouldBe 0
        (body \ "track_total_hits").as[Boolean] shouldBe true
      }

      Seq(
        "a tuple shorter than the sort" -> (newestFirst, Seq[JsValue](JsNumber(0))) -> "length",
        "a tuple longer than the sort" -> (newestFirst, afterEverything :+ JsString("extra")) -> "length",
        "a mode other than max" -> (Seq(Json.obj("usages.dateAdded" -> Json.obj("order" -> "desc", "mode" -> "min",
          "nested" -> Json.obj("path" -> "usages"))), id), afterEverything) -> "mode",
        "nulls sorting first" -> (Seq(Json.obj("metadata.dateTaken" -> Json.obj("order" -> "desc", "missing" -> "_first")), id),
          afterEverything) -> "missing",
        "an explicit _shard_doc" -> (Seq(plain("uploadTime", "desc"), Json.obj("_shard_doc" -> "asc")),
          Seq[JsValue](JsNumber(0), JsNumber(1))) -> "_shard_doc",
        "an empty sort" -> (Seq.empty[JsObject], Seq.empty[JsValue]) -> "sort",
        "more than ten sort clauses" -> ((1 to 10).map(n => plain(s"field$n", "asc")) :+ id,
          Seq.fill[JsValue](11)(JsNumber(0))) -> "at most 10",
      ).foreach { case ((what, (sort, sortValues)), mentioned) =>
        it(s"refuses $what") {
          refusalOf(sort, sortValues) should include(mentioned)
        }
      }

      it("responds 422 to a tuple of the wrong length") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val (status, _) = statusAndJson(controller.rankImages().apply(FakeRequest("POST", "/images/rank")
          .withBody(Json.obj("sort" -> newestFirst, "sortValues" -> Json.arr(0)))))
        status shouldBe 422
      }

      it("returns the PIT expiry contract for a closed PIT") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val response = for {
          opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
          _ <- client.execute(deletePointInTime(opened.result.id))
          result <- controller.rankImages().apply(FakeRequest("POST", "/images/rank")
            .withBody(Json.obj("sort" -> newestFirst, "sortValues" -> afterEverything, "pitId" -> opened.result.id)))
        } yield result

        val (status, json) = statusAndJson(response)
        status shouldBe 410
        (json \ "errorKey").as[String] shouldBe "search-after-pit-expired"
      }

      describe("completeness") {
        def response(timedOut: Boolean, failedShards: Int) =
          SearchResponse(1L, timedOut, false, Map.empty, Shards(2, failedShards, 2 - failedShards), None, None, Map.empty,
            SearchHits(Total(42L, "eq"), 0.0, Array.empty))

        it("returns the exact total when every shard completed in time") {
          ES.completeCount(response(timedOut = false, failedShards = 0)) shouldBe 42L
        }

        Seq("the search timed out" -> response(timedOut = true, failedShards = 0),
          "a shard failed" -> response(timedOut = false, failedShards = 1)).foreach { case (reason, incomplete) =>
          it(s"refuses to publish a count when $reason") {
            the[Exception] thrownBy ES.completeCount(incomplete) shouldBe ImageRankIncomplete
          }
        }
      }
    }
  }

  describe("searchAfter") {
    // Mirrors the default kupua sort clause: uploadTime desc, id asc as tiebreaker
    val sortClause = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))

    describe("request body parsing") {
      val searchParams = SearchParams(tier = Internal, length = 3)

      Seq(
        "absent" -> Json.obj(),
        "null" -> Json.obj("q" -> JsNull),
        "number" -> Json.obj("q" -> 123),
        "boolean" -> Json.obj("q" -> true),
        "array" -> Json.obj("q" -> Json.arr("is:deleted")),
        "object" -> Json.obj("q" -> Json.obj("query" -> "is:deleted")),
      ).foreach { case (queryType, body) =>
        it(s"applies default hiding when q is $queryType") {
          val parsed = SearchParamsBody.fromJson(body, Internal).toOption.get

          parsed.query shouldBe None
          parsed.structuredQuery shouldBe lib.querysyntax.Parser.run("")
          parsed.structuredQuery should not be empty
        }
      }

      Seq("fixture\tterm", "-is:deletedx", "-description:\"is:deleted\"", "\"usages@status:replaced\"").foreach { query =>
        it(s"D3 keeps parsed default hiding for non-intent query $query") {
          val parsed = SearchParamsBody.fromJson(Json.obj("q" -> query), Internal).toOption.get

          parsed.structuredQuery should contain allElementsOf Parser.run("")
        }
      }

      Seq("is:\"deleted\"", "is:'deleted'", "is:DELETED", "is:DELETED -is:deletedx").foreach { query =>
        it(s"D3 preserves explicit parsed deleted intent for $query") {
          val parsed = SearchParamsBody.fromJson(Json.obj("q" -> query), Internal).toOption.get

          parsed.structuredQuery should not contain Negation(Match(IsField, IsValue("deleted")))
          parsed.structuredQuery should contain (Parser.run("").last)
        }
      }

      it("accepts a sort array and an omitted first-page cursor") {
        val body = Json.obj(
          "sort"      -> sortClause,
          "reverse"   -> true,
          "seekToEnd" -> true,
        )

        SearchAfterParamsBody.fromJson(body, searchParams).toOption shouldBe Some(SearchAfterParams(
          searchParams = searchParams,
          sort         = sortClause,
          sortValues   = None,
          pitId        = None,
          reverse      = true,
          seekToEnd    = true,
        ))
      }

      it("accepts populated and leading-null cursors") {
        val populatedCursor = Seq[JsValue](JsNumber(1700000000000L), JsString("test-image-1"))
        val nullZoneCursor   = JsNull +: populatedCursor

        Seq(populatedCursor, nullZoneCursor).foreach { cursor =>
          val parsed = SearchAfterParamsBody.fromJson(
            Json.obj("sort" -> sortClause, "sortValues" -> cursor),
            searchParams,
          )

          parsed.toOption.flatMap(_.sortValues) shouldBe Some(cursor)
        }
      }

      it("rejects a present sort value that is not an array of objects") {
        val parsed = SearchAfterParamsBody.fromJson(
          Json.obj("sort" -> Json.obj("uploadTime" -> "desc")),
          searchParams,
        )

        parsed.left.toOption shouldBe Some("sort must be an array of objects")
      }

      it("rejects a present sortValues value that is not an array") {
        val parsed = SearchAfterParamsBody.fromJson(
          Json.obj("sort" -> sortClause, "sortValues" -> "not-a-cursor"),
          searchParams,
        )

        parsed.left.toOption shouldBe Some("sortValues must be an array when present")
      }

      it("rejects non-scalar sortValues elements") {
        Seq(Json.obj("unexpected" -> true), Json.arr(1), Json.toJson(true)).foreach { invalidValue =>
          val parsed = SearchAfterParamsBody.fromJson(
            Json.obj("sort" -> sortClause, "sortValues" -> Json.arr(1700000000000L, invalidValue)),
            searchParams,
          )

          parsed.left.toOption shouldBe Some("sortValues elements must be strings, numbers or null")
        }
      }
    }

    it("returns all images and correct total on first page (no cursor)") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = expectedNumberOfImages + 10),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ES.searchAfter(params), timeout, interval) { result =>
        result.total shouldBe expectedNumberOfImages
        result.hits.size shouldBe expectedNumberOfImages
        result.nextSortValues shouldBe defined
      }
    }

    it("cursor pagination: second page returns distinct images from first page") {
      implicit val logMarker: LogMarker = MarkerMap()

      val pageSize = 3

      val page1 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)

      page1.hits.size shouldBe pageSize
      page1.nextSortValues shouldBe defined
      val page1Ids = page1.hits.map(_._1).toSet

      val page2 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize, countAll = Some(false)),
        sort         = sortClause,
        sortValues   = page1.nextSortValues,
        pitId        = None,
      )), fiveSeconds)

      page2.hits.size shouldBe pageSize
      // No image id from page 1 should appear on page 2
      page2.hits.map(_._1).toSet.intersect(page1Ids) shouldBe empty
    }

    it("null-zone round-trip: cursor with JsNull prefix routes through null-zone path and returns paged results") {
      implicit val logMarker: LogMarker = MarkerMap()

      // Strategy: do a forward page with uploadTime+id sort to get real sort values,
      // then manually prepend JsNull to simulate a null-zone cursor.
      // Null-zone cursor is passed with a 3-field sort where the first field is an
      // unknown field (stripped by the null-zone handler before hitting ES, so no
      // mapping error). The remaining [uploadTime, id] fields ARE mapped.
      val twoFieldSort = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val threeFieldSort = Seq(
        Json.obj("test_null_zone_primary_field" -> "desc"), // null-zone primary — stripped before ES query
        Json.obj("uploadTime" -> "desc"),
        Json.obj("id"         -> "asc"),
      )
      val pageSize = 3

      // Page 1 with 2-field sort (no cursor) — establishes real sort values
      val page1 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = twoFieldSort,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)

      page1.hits.size shouldBe pageSize
      page1.nextSortValues shouldBe defined

      // Construct a null-zone cursor: prepend JsNull to page1's last sort values.
      // This mirrors what kupua does: it detects sentinel values and converts them
      // to JsNull before sending the next-page cursor to the server.
      val nullZoneCursor = Some(JsNull +: page1.nextSortValues.get)

      // Page 2 with 3-field sort + null-zone cursor.
      // The server detects JsNull at position 0, strips "test_null_zone_primary_field"
      // from the sort (so ES only sees [uploadTime, id]), and applies
      // must_not exists(test_null_zone_primary_field) — all images pass since none have it.
      val page2 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize, countAll = Some(false)),
        sort         = threeFieldSort,
        sortValues   = nullZoneCursor,
        pitId        = None,
      )), fiveSeconds)

      page2.hits.size shouldBe pageSize
      // Null-zone page 2 must not overlap with page 1
      page2.hits.map(_._1).toSet.intersect(page1.hits.map(_._1).toSet) shouldBe empty
    }

    it("null-zone with a nested primary sort excludes images that have the sorted field") {
      implicit val logMarker: LogMarker = MarkerMap()

      // usages is a nested type, so a root-level exists(usages.dateAdded) matches no parent
      // document. The null-zone must_not would then exclude nothing, and images that DO have
      // usages would leak into the null zone — i.e. be returned twice across the full walk.
      val twoFieldSort = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val nestedPrimarySort = Seq(
        Json.obj("usages.dateAdded" -> Json.obj(
          "order"   -> "desc",
          "mode"    -> "max",
          "missing" -> "_last",
          "nested"  -> Json.obj("path" -> "usages"),
        )),
        Json.obj("uploadTime" -> "desc"),
        Json.obj("id"         -> "asc"),
      )

      val page1 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 1),
        sort         = twoFieldSort,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)

      val nullZoneCursor = Some(JsNull +: page1.nextSortValues.get)

      val nullZone = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = expectedNumberOfImages + 10, countAll = Some(false)),
        sort         = nestedPrimarySort,
        sortValues   = nullZoneCursor,
        pitId        = None,
      )), fiveSeconds)

      nullZone.hits should not be empty
      nullZone.hits.filter(_._2.instance.usages.nonEmpty).map(_._1) shouldBe empty
    }

    it("reverse: first page with reverse=true returns opposite end of corpus from forward") {
      implicit val logMarker: LogMarker = MarkerMap()

      val pageSize = 3

      // Forward: uploadTime desc, id asc — yields images with alphabetically smallest ids first
      // (all test images share the same DateTime.now() uploadTime, so id is the tiebreaker).
      val forward = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)

      // Reverse: flips sort to uploadTime asc, id desc → alphabetically largest ids first.
      val reverse = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
        reverse      = true,
      )), fiveSeconds)

      forward.hits.size shouldBe pageSize
      reverse.hits.size shouldBe pageSize
      // Forward and reverse from position 0 must come from opposite ends of the sort order
      forward.hits.map(_._1).toSet.intersect(reverse.hits.map(_._1).toSet) shouldBe empty
    }

    it("reverse cursor continuation: paging backward with a cursor walks the corpus end-to-start") {
      implicit val logMarker: LogMarker = MarkerMap()

      val pageSize = 3

      // Ground truth: the full corpus in forward display order (uploadTime desc, id asc).
      val full = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = expectedNumberOfImages + 10),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)
      val fullIds = full.hits.map(_._1)

      // Reverse page 1 (no cursor): the LAST pageSize images in forward order, returned in
      // forward display order (the adapter reverses ES's reversed scan back to forward order).
      val rPage1 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
        reverse      = true,
      )), fiveSeconds)

      rPage1.hits.map(_._1) shouldBe fullIds.takeRight(pageSize)

      // Continue backward. The cursor is the FIRST returned hit's sort values (the frontier —
      // earliest-in-forward-order of the current page). This mirrors how kupua extends backward:
      // it reads the per-hit sortValues.head, not the nextSortValues convenience.
      val rPage2 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize, countAll = Some(false)),
        sort         = sortClause,
        sortValues   = Some(rPage1.sortValues.head),
        pitId        = None,
        reverse      = true,
      )), fiveSeconds)

      // Reverse page 2 is the PREVIOUS pageSize block in forward order, also returned in forward order.
      rPage2.hits.map(_._1) shouldBe fullIds.dropRight(pageSize).takeRight(pageSize)
      // And disjoint from page 1.
      rPage2.hits.map(_._1).toSet.intersect(rPage1.hits.map(_._1).toSet) shouldBe empty
    }

    it("seekToEnd + null-zone: combining both does not error and still pages correctly") {
      implicit val logMarker: LogMarker = MarkerMap()

      // Guard for the two head-of-clause transforms coexisting. seekToEnd sets missing:"_first"
      // on the primary sort field; the null-zone handler then STRIPS that same primary field
      // (the cursor's null slot) before querying ES. So in the null zone seekToEnd lands on a
      // field that gets removed, and the surviving tiebreakers (uploadTime, id) are never null
      // — making seekToEnd inert here. This test pins that the combination runs without error and
      // produces the same disjoint paging as plain null-zone.
      val twoFieldSort = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val threeFieldSort = Seq(
        Json.obj("test_null_zone_primary_field" -> "desc"), // null-zone primary — stripped before ES query
        Json.obj("uploadTime" -> "desc"),
        Json.obj("id"         -> "asc"),
      )
      val pageSize = 3

      val page1 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = twoFieldSort,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)

      page1.hits.size shouldBe pageSize
      page1.nextSortValues shouldBe defined

      val nullZoneCursor = Some(JsNull +: page1.nextSortValues.get)

      val page2 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize, countAll = Some(false)),
        sort         = threeFieldSort,
        sortValues   = nullZoneCursor,
        pitId        = None,
        seekToEnd    = true, // the addition under test
      )), fiveSeconds)

      page2.hits.size shouldBe pageSize
      page2.hits.map(_._1).toSet.intersect(page1.hits.map(_._1).toSet) shouldBe empty
    }

    it("special-sort seekToEnd serializes the missing primary cursor as null") {
      implicit val logMarker: LogMarker = MarkerMap()

      val specialSort = Seq(
        Json.obj("usages.dateAdded" -> Json.obj(
          "order"   -> "desc",
          "mode"    -> "max",
          "missing" -> "_last",
          "nested"  -> Json.obj("path" -> "usages"),
        )),
        Json.obj("uploadTime" -> "desc"),
        Json.obj("id"         -> "asc"),
      )

      val endPage = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = specialSort,
        sortValues   = None,
        pitId        = None,
        reverse      = true,
        seekToEnd    = true,
      )), fiveSeconds)

      endPage.hits should not be empty
      endPage.sortValues.foreach { cursor =>
        cursor should have length 3
        cursor.head shouldBe JsNull
      }
    }

    it("PIT: a two-page cursor walk over a point-in-time snapshot") {
      implicit val logMarker: LogMarker = MarkerMap()

      val pitId = Await.result(
        client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id),
        fiveSeconds
      )

      val pageSize = 3

      val page1 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize),
        sort         = sortClause,
        sortValues   = None,
        pitId        = Some(pitId),
      )), fiveSeconds)

      page1.hits.size shouldBe pageSize
      page1.nextSortValues shouldBe defined
      page1.pitId shouldBe defined

      // ES appends an implicit _shard_doc tiebreaker to every hit's sort array under a PIT, but the
      // cursor we hand back deliberately omits it: cursors outlive the PIT (clients persist them and
      // retry without a PIT once it expires) and a _shard_doc value in a non-PIT search_after is
      // rejected by ES. This pins both halves of that contract.
      val rawSortLength = Await.result(
        client.execute(
          ElasticDsl.search(Nil)
            .query(matchAllQuery())
            .pit(Pit(pitId).keepAlive(1.minute))
            .sortBy(fieldSort("uploadTime").order(SortOrder.DESC), fieldSort("id").order(SortOrder.ASC))
            .size(1)
        ).map(_.result.hits.hits.head.sort.getOrElse(Seq.empty).length),
        fiveSeconds
      )
      rawSortLength shouldBe sortClause.length + 1
      page1.nextSortValues.get.length shouldBe sortClause.length

      val page2 = Await.result(ES.searchAfter(SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = pageSize, countAll = Some(false)),
        sort         = sortClause,
        sortValues   = page1.nextSortValues,
        pitId        = page1.pitId,
      )), fiveSeconds)

      page2.hits.size shouldBe pageSize
      page2.hits.map(_._1).toSet.intersect(page1.hits.map(_._1).toSet) shouldBe empty
    }

    it("PIT: a full cursor walk loses no documents when the sort clause ends in a unique tiebreaker") {
      implicit val logMarker: LogMarker = MarkerMap()

      // Dropping the _shard_doc tiebreaker is only safe because the client's own sort ends in a
      // unique field (id). This walks the whole corpus a page at a time to prove nothing is skipped
      // or repeated at a page boundary — which is what would happen if `id` were absent.
      val pitId = Await.result(
        client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id),
        fiveSeconds
      )

      val pageSize = 3

      def walk(cursor: Option[Seq[JsValue]], acc: Seq[String], pages: Int): Seq[String] = {
        val page = Await.result(ES.searchAfter(SearchAfterParams(
          searchParams = SearchParams(tier = Internal, length = pageSize, countAll = Some(false)),
          sort         = sortClause,
          sortValues   = cursor,
          pitId        = Some(pitId),
        )), fiveSeconds)

        if (page.hits.isEmpty || pages > 30) acc
        else walk(page.nextSortValues, acc ++ page.hits.map(_._1), pages + 1)
      }

      val walked = walk(None, Seq.empty, 0)

      walked.size shouldBe expectedNumberOfImages
      walked.distinct.size shouldBe expectedNumberOfImages
    }

    it("cursor-length-mismatch → Future.failed(InvalidUriParams)") {
      implicit val logMarker: LogMarker = MarkerMap()

      // Sort has 2 fields; cursor has only 1 value → must reject with InvalidUriParams
      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = sortClause, // 2 fields: uploadTime, id
        sortValues   = Some(Seq(JsNumber(1700000000000L))), // only 1 value — wrong length
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        // InvalidUriParams.message field (not getMessage — that returns null in Throwable)
        ex.asInstanceOf[InvalidUriParams].message should include("sortValues length")
      }
    }

    it("empty sort clause → Future.failed(InvalidUriParams)") {
      implicit val logMarker: LogMarker = MarkerMap()

      // Without a sort clause there is no deterministic order and the returned cursor is unusable,
      // so the request must be rejected rather than silently relevance-ordered.
      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = Nil,
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("sort")
      }
    }

    it("non-zero offset → Future.failed(InvalidUriParams)") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, offset = 100, length = 3),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("offset")
      }
    }

    it("malformed sort order → Future.failed(InvalidUriParams), not a synchronous throw") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = Seq(Json.obj("uploadTime" -> "decs")),
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("decs")
      }
    }

    it("malformed sort mode → Future.failed(InvalidUriParams), not a synchronous throw") {
      implicit val logMarker: LogMarker = MarkerMap()

      // Guards the 422 contract: sort deserialisation runs before any Future exists, so an escaping
      // throw would bypass the controller's recover and surface as a 500.
      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = Seq(Json.obj("uploadTime" -> Json.obj("order" -> "desc", "mode" -> "bogus"))),
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("bogus")
      }
    }

    it("residual null after leading-primary reduction → Future.failed(InvalidUriParams)") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort = Seq(
          Json.obj("missingPrimary" -> "desc"),
          Json.obj("uploadTime"     -> "desc"),
          Json.obj("id"             -> "asc"),
        ),
        sortValues = Some(Seq(JsNull, JsNull, JsString("test-image-1"))),
        pitId      = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("null")
      }
    }

    it("residual null without leading-primary reduction → Future.failed(InvalidUriParams)") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = sortClause,
        sortValues   = Some(Seq(JsNumber(1700000000000L), JsNull)),
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("null")
      }
    }

    it("explicit _shard_doc sort → Future.failed(InvalidUriParams), so public tuples stay PIT-independent") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort         = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("_shard_doc" -> "asc")),
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("_shard_doc")
      }
    }

    it("duplicate sort fields → Future.failed(InvalidUriParams)") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = 3),
        sort = Seq(
          Json.obj("uploadTime" -> "desc"),
          Json.obj("uploadTime" -> "asc"),
          Json.obj("id"         -> "asc"),
        ),
        sortValues = None,
        pitId      = None,
      )

      whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
        ex shouldBe an[InvalidUriParams]
        ex.asInstanceOf[InvalidUriParams].message should include("duplicate")
      }
    }

    Seq("usagesDateAdded", "dateAddedToCollection").foreach { unresolvedAlias =>
      it(s"unresolved $unresolvedAlias alias → Future.failed(InvalidUriParams), including in reverse") {
        implicit val logMarker: LogMarker = MarkerMap()

        val params = SearchAfterParams(
          searchParams = SearchParams(tier = Internal, length = 3),
          sort = Seq(
            Json.obj(unresolvedAlias -> "desc"),
            Json.obj("uploadTime"    -> "desc"),
            Json.obj("id"            -> "asc"),
          ),
          sortValues = None,
          pitId      = None,
          reverse    = true,
        )

        whenReady(ES.searchAfter(params).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message should include("unresolved")
        }
      }
    }

    it("applies the syndication review-queue runtime mapping, matching search()") {
      implicit val logMarker: LogMarker = MarkerMap()

      val searchParams = SearchParams(
        tier              = Internal,
        length            = expectedNumberOfImages + 10,
        syndicationStatus = Some(AwaitingReviewForSyndication),
      )

      val viaSearch = Await.result(ESWithRuntimeFieldsFix.search(searchParams), fiveSeconds)
      val viaCursor = Await.result(ESWithRuntimeFieldsFix.searchAfter(SearchAfterParams(
        searchParams = searchParams,
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )), fiveSeconds)

      viaCursor.total shouldBe viaSearch.total
      viaCursor.hits.map(_._1).toSet shouldBe viaSearch.hits.map(_._1).toSet
    }

    it("dateAddedToCollection both orders apply pathHierarchy filter when hierarchy condition present") {
      implicit val logMarker: LogMarker = MarkerMap()
      // Use a plain uploadTime/id sort clause — collections.actionData.date is not in the test-index
      // mapping (no test images have collections), so sending it as a sort field would cause an ES
      // error. searchAfter reads orderBy only to decide whether to add the pathHierarchy filter;
      // the actual ES sort comes from the `sort` array, so the two are independent.
      val sortClause    = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val hierarchyCond = Match(HierarchyField, Phrase("no/such/collection/path"))

      // desc token ("dateAddedToCollection"): pathHierarchy filter fires → 0 results
      val paramsDesc = SearchAfterParams(
        searchParams = SearchParams(
          tier = Internal, length = 100,
          orderBy = Some("dateAddedToCollection"),
          structuredQuery = List(hierarchyCond),
        ),
        sort       = sortClause,
        sortValues = None,
        pitId      = None,
      )
      whenReady(ES.searchAfter(paramsDesc), timeout, interval) { result =>
        result.total shouldBe 0
      }

      // asc token ("-dateAddedToCollection"): QueryBuilder widening ensures the filter also fires → 0 results
      val paramsAsc = SearchAfterParams(
        searchParams = SearchParams(
          tier = Internal, length = 100,
          orderBy = Some("-dateAddedToCollection"),
          structuredQuery = List(hierarchyCond),
        ),
        sort       = sortClause,
        sortValues = None,
        pitId      = None,
      )
      whenReady(ES.searchAfter(paramsAsc), timeout, interval) { result =>
        result.total shouldBe 0
      }
    }
  }

  describe("searchAfter with fileMetadata field aliases") {
    // Mirrors the default kupua sort clause: uploadTime desc, id asc as tiebreaker
    val sortClause = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))

    // Regression guard for the partial-fileMetadata parse failure. With field aliases pointing
    // into fileMetadata, the search-after projection returns a PARTIAL fileMetadata for any image
    // that has one (e.g. test-image-8). Image's reader rejects a partial fileMetadata, so without
    // the resolveSearchAfterHit strip that image silently dropped out and its alias was unreadable.
    // These tests fail if the strip is removed.
    it("returns every image (incl. one with fileMetadata) despite the partial-source projection") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = expectedNumberOfImages + 10),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ESWithFieldAliases.searchAfter(params), timeout, interval) { result =>
        result.total shouldBe expectedNumberOfImages
        result.hits.size shouldBe expectedNumberOfImages
        result.hits.map(_._1) should contain("test-image-8")
      }
    }

    it("keeps the alias leaves in the wrapper source and strips the rest of fileMetadata") {
      implicit val logMarker: LogMarker = MarkerMap()

      val params = SearchAfterParams(
        searchParams = SearchParams(tier = Internal, length = expectedNumberOfImages + 10),
        sort         = sortClause,
        sortValues   = None,
        pitId        = None,
      )

      whenReady(ESWithFieldAliases.searchAfter(params), timeout, interval) { result =>
        val hit = result.hits.find(_._1 == "test-image-8")
        hit shouldBe defined
        val wrapper = hit.get._2

        // Alias leaves survive in the raw source (extractAliasFieldValues reads from here)
        (wrapper.source \ "fileMetadata" \ "xmp" \ "org:ProgrammeMaker").asOpt[String] shouldBe Some("xmp programme maker")
        (wrapper.source \ "fileMetadata" \ "iptc" \ "Caption Writer/Editor").asOpt[String] shouldBe Some("the editor")

        // Non-aliased fileMetadata leaves are NOT fetched (projection stays slim)
        (wrapper.source \ "fileMetadata" \ "iptc" \ "Caption/Abstract").asOpt[String] shouldBe None
        (wrapper.source \ "fileMetadata" \ "exif").toOption shouldBe None

        // The parsed Image.fileMetadata is the empty default (dropped fields stripped before validation)
        wrapper.instance.fileMetadata.xmp shouldBe empty
        wrapper.instance.fileMetadata.iptc shouldBe empty
      }
    }
  }

  private def saveImages(images: Seq[Image]) = {
    implicit val logMarker: LogMarker = MarkerMap()

    Future.sequence(images.map { i =>
      executeAndLog(indexInto(index) id i.id source Json.stringify(Json.toJson(i)), s"Indexing test image")
    })
  }

  private def totalImages: Long = Await.result(ES.client.execute(ElasticDsl.search(ES.imagesCurrentAlias)).map {
    _.result.totalHits
  }, oneHundredMilliseconds)

  private def purgeTestImages = {
    implicit val logMarker: LogMarker = MarkerMap()

    def deleteImages = executeAndLog(deleteByQuery(index, matchAllQuery()), s"Deleting images")

    Await.result(deleteImages, fiveSeconds)
    eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe 0)
  }

}
