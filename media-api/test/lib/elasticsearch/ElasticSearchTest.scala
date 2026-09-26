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
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus, RemovedUsageStatus, SyndicationUsage, UnknownUsageStatus, ComposerUsageReference, DigitalUsage, FrontUsageReference, InDesignUsageReference, PrintUsage, Usage, UsageType}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.{Executor, Functor, Handler, Index, RequestSuccess, Response}
import com.sksamuel.elastic4s.requests.common.Shards
import com.sksamuel.elastic4s.requests.searches.{Pit, SearchBodyBuilderFn, SearchHits, SearchRequest, SearchResponse, Total}
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
import play.api.libs.json.{JsLookupResult, JsNull, JsNumber, JsObject, JsString, JsValue, Json}
import play.api.mvc.{AnyContent, Result}
import play.api.mvc.Security.AuthenticatedRequest
import play.api.test.FakeRequest

import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}
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
        result.total shouldBe 1
        result.hits.head._2.instance.fileMetadata.xmp.nonEmpty shouldBe true
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

    def assertViaGet(body: JsObject, expected: Set[String]): Unit = {
      val controller = mediaApiFor(uploader, ES, writer, privileged = true)
      val queryParams = body.fields.map { case (name, value) =>
        name -> (value match {
          case JsString(text) => text
          case other => Json.stringify(other)
        })
      }
      assertPage(controller.imageSearch().apply(getRequest(queryParams.toList: _*)), expected)
    }

    def assertViaD3(body: JsObject, expected: Set[String]): Unit = {
      val d3 = imageQueryControllerFor(uploader, ES, writer, privileged = true)
      assertPage(d3.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
        .withBody(body ++ Json.obj("sort" -> sortClause))), expected)
    }

    def assertBothModes(body: JsObject, expected: Set[String]): Unit = {
      assertViaGet(body, expected)
      assertViaD3(body, expected)
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

    it("filters acquired rights through D3 while GET /images keeps ignoring the parameter, and keeps mixed-rights status semantics") {
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
        assertViaD3(base ++ Json.obj("hasRightsAcquired" -> true), acquired)
        assertViaD3(base ++ Json.obj("hasRightsAcquired" -> false), all -- acquired)
        // Unchanged Grid behaviour: GET /images does not read hasRightsAcquired (GRID-014).
        assertViaGet(base ++ Json.obj("hasRightsAcquired" -> true), all)
        assertViaGet(base ++ Json.obj("hasRightsAcquired" -> false), all)
        assertBothModes(base ++ Json.obj("syndicationStatus" -> "unsuitable"), all - "d3-rights-true")
      }
    }

    describe("image page execution completeness") {
      val fixtures = Seq("complete-page-a", "complete-page-b").map(id => createImage(id, Handout()))

      def pageResponse(endpoint: String, response: SearchResponse, countAll: Boolean): Future[Result] = {
        val synthetic = new ElasticSearch(mediaApiConfig, mediaApiMetrics, elasticConfig, () => List.empty, mock[Scheduler]) {
          override lazy val client = ES.client
          override def executeAndLog[Request, Result](request: Request, message: String, notFoundSuccessful: Boolean)(implicit
            functor: Functor[Future], executor: Executor[Future], handler: Handler[Request, Result],
            manifest: Manifest[Result], executionContext: ExecutionContext, logMarkers: LogMarker
          ): Future[Response[Result]] = request match {
            case _: SearchRequest => Future.successful(RequestSuccess(200, None, Map.empty, response).asInstanceOf[Response[Result]])
            case _ => super.executeAndLog(request, message, notFoundSuccessful)(
              functor, executor, handler, manifest, executionContext, logMarkers)
          }
        }
        val controller = imageQueryControllerFor(uploader, synthetic, writer)
        val body = Json.obj("sort" -> sortClause, "length" -> 2, "countAll" -> countAll)
        val request = FakeRequest("POST", s"/images/$endpoint").withBody(body)
        if (endpoint == "search-after") controller.searchAfterImages().apply(request)
        else controller.windowImages().apply(request)
      }

      Seq("search-after", "window").foreach { endpoint =>
        it(s"$endpoint omits an undecodable image from a complete execution without failing the page") {
          val unreadableId = "complete-page-unreadable"
          withImages(fixtures.take(1)) { _ =>
            try {
              val result = for {
                _ <- client.execute(indexInto(index).id(unreadableId).source(Json.stringify(Json.obj("id" -> unreadableId))))
                _ <- client.execute(refreshIndex(index))
                response <- client.execute(search(index).query(idsQuery(Seq(fixtures.head.id, unreadableId)))
                  .sortBy(fieldSort("uploadTime").desc(), fieldSort("id").asc()).size(2))
                page <- pageResponse(endpoint, response.result, countAll = true)
              } yield page
              whenReady(result, timeout, interval) { page =>
                page.header.status shouldBe 200
                val json = Json.parse(page.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
                (json \ "data").as[Seq[JsValue]] should have size 1
                (json \ "sortValues").as[Seq[Seq[JsValue]]] should have size 1
                (json \ "total").as[Long] shouldBe 2L
                if (endpoint == "window") (json \ "rawHitCount").as[Int] shouldBe 2
              }
            } finally {
              whenReady(client.execute(deleteById(index, unreadableId)).flatMap(_ => client.execute(refreshIndex(index))), timeout, interval)(_ => ())
            }
          }
        }

        Seq(0, 1, 2).foreach { hitCount =>
          Seq(true, false).foreach { countAll =>
            Seq(("complete", false, 0), ("timeout only", true, 0), ("failed shard only", false, 1)).foreach {
              case (execution, timedOut, failedShards) =>
                it(s"$endpoint with $execution and $hitCount hits (countAll=$countAll) publishes only complete execution") {
                  withImages(fixtures) { _ =>
                    val result = for {
                      original <- client.execute(search(index).query(idsQuery(fixtures.map(_.id)))
                        .sortBy(fieldSort("uploadTime").desc(), fieldSort("id").asc()).size(2))
                      response = SearchResponse(1L, timedOut, false, Map.empty,
                        Shards(2, failedShards, 2 - failedShards), None, None, Map.empty,
                        original.result.hits.copy(hits = original.result.hits.hits.take(hitCount)))
                      page <- pageResponse(endpoint, response, countAll)
                    } yield page

                    whenReady(result, timeout, interval) { page =>
                      val json = Json.parse(page.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
                      if (timedOut || failedShards > 0) {
                        page.header.status shouldBe 503
                        (json \ "errorKey").as[String] shouldBe s"$endpoint-incomplete"
                        (json \ "data").toOption shouldBe None
                        (json \ "sortValues").toOption shouldBe None
                        (json \ "total").toOption shouldBe None
                      } else {
                        page.header.status shouldBe 200
                        (json \ "data").as[Seq[JsValue]] should have size hitCount
                        (json \ "sortValues").as[Seq[Seq[JsValue]]] should have size hitCount
                        if (countAll) (json \ "total").as[Long] shouldBe 2L
                        else if (endpoint == "search-after") (json \ "total").as[Long] shouldBe 0L
                        else (json \ "total").toOption shouldBe None
                        if (endpoint == "window") (json \ "rawHitCount").as[Int] shouldBe hitCount
                      }
                    }
                  }
                }
            }
          }
        }
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

    describe("recorded client request bodies") {
      // Each file holds the exact POST bodies a client sent for one read, in order.
      val recordings = new java.io.File(getClass.getResource("/ordered-read-bodies").toURI)
        .listFiles().filter(_.getName.endsWith(".json")).sortBy(_.getName).toSeq
      def calls(file: java.io.File): Seq[JsObject] =
        Json.parse(java.nio.file.Files.readString(file.toPath)).as[Seq[JsObject]]
      val reader = imageQueryControllerFor(uploader, ES, writer, privileged = true)

      def replay(call: JsObject): Future[Result] = {
        val path = (call \ "path").as[String]
        val request = FakeRequest("POST", path).withBody((call \ "body").as[JsObject])
        path match {
          case "/images/search-after" => reader.searchAfterImages().apply(request)
          case "/images/window"       => reader.windowImages().apply(request)
          case "/images/rank"         => reader.rankImages().apply(request)
          case "/images/sort-profile" => reader.sortProfile().apply(request)
          case "/images/keys"         => reader.imageKeys().apply(request)
          case "/images/count"        => reader.countImages().apply(request)
          case "/images/aggregations" => reader.aggregateImages().apply(request)
          case "/images/mget"         => reader.mgetImages().apply(request)
          case other                  => fail(s"no ordered read at $other")
        }
      }

      it("cover every ordered-read endpoint") {
        recordings.flatMap(calls).map(call => (call \ "path").as[String]).toSet shouldBe
          Set("/images/search-after", "/images/window", "/images/rank", "/images/sort-profile", "/images/keys", "/images/count",
            "/images/aggregations", "/images/mget")
      }

      recordings.foreach { file =>
        it(s"accepts and executes ${file.getName.stripSuffix(".json")}") {
          calls(file).foreach { call =>
            whenReady(replay(call), timeout, interval) { result =>
              val text = result.body.asInstanceOf[HttpEntity.Strict].data.utf8String
              withClue(s"${(call \ "path").as[String]} answered $text: ") { result.header.status shouldBe 200 }
            }
          }
        }
      }

      // Every recorded read must agree with a search-after walk of its own recorded search scope.
      // Only values a recording cannot know for this index (a tuple, an id, a scope value) are
      // replaced, and only with values taken from that walk.
      describe("agree with a search-after walk of the same recorded scope") {
        val t0 = DateTime.parse("2020-01-01T00:00:00Z")
        def replayFixture(id: String, takenDay: Option[Int], uploadHour: Int, credit: Option[String], usageDays: Int*): Image = {
          val image = createImage(id, Handout(), usages = usageDays.map(day => createDigitalUsage(t0.plusDays(day))).toList)
          image.copy(uploadTime = t0.plusHours(uploadHour),
            metadata = image.metadata.copy(dateTaken = takenDay.map(day => t0.plusDays(day)), credit = credit))
        }
        // Ties on dateTaken and credit, missing dateTaken and credit, several usages on one image.
        val fixtures = Seq(
          replayFixture("replay-a", Some(3), 1, Some("AAP"), 5),
          replayFixture("replay-b", Some(3), 2, Some("AAP"), 2, 9),
          replayFixture("replay-c", Some(1), 3, None),
          replayFixture("replay-d", None,    4, Some("Reuters"), 5),
          replayFixture("replay-e", None,    5, None),
          replayFixture("replay-f", Some(7), 6, Some("AAP")),
        )

        def recorded(name: String): Seq[JsObject] =
          calls(recordings.find(_.getName == s"$name.json").getOrElse(fail(s"no recording $name")))
        def bodyOf(call: JsObject): JsObject = (call \ "body").as[JsObject]
        def respond(path: String, body: JsObject): JsValue =
          whenReady(replay(Json.obj("path" -> path, "body" -> body)), timeout, interval) { result =>
            val text = result.body.asInstanceOf[HttpEntity.Strict].data.utf8String
            withClue(s"$path answered $text: ") { result.header.status shouldBe 200 }
            Json.parse(text)
          }
        def page(json: JsValue): Seq[(String, Seq[JsValue])] =
          (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String])
            .zip((json \ "sortValues").as[Seq[Seq[JsValue]]])

        val readFields = Seq("sortValues", "reverse", "seekToEnd", "offset", "length", "countAll", "ids", "pitId",
          "operation", "field", "percentile", "scope", "missingField", "interval", "after", "size", "includeCoveredCount",
          "fields", "isFilters")
        def walk(body: JsObject): Seq[(String, Seq[JsValue])] = {
          val scope = readFields.foldLeft(body)(_ - _) ++ Json.obj("length" -> 200, "countAll" -> false)
          def from(cursor: Option[Seq[JsValue]], acc: Seq[(String, Seq[JsValue])], pages: Int): Seq[(String, Seq[JsValue])] = {
            val next = page(respond("/images/search-after", scope ++ cursor.fold(Json.obj())(c => Json.obj("sortValues" -> c))))
            if (next.isEmpty || pages > 20) acc else from(next.lastOption.map(_._2), acc ++ next, pages + 1)
          }
          from(None, Seq.empty, 0)
        }
        def nullPrimary(entry: (String, Seq[JsValue])): Boolean = entry._2.headOption.contains(JsNull)
        def samples(walked: Seq[(String, Seq[JsValue])]): Seq[Int] =
          (Seq(0, 1, walked.size / 2, walked.size - 1) :+ walked.indexWhere(nullPrimary))
            .filter(i => i >= 0 && i < walked.size).distinct

        def withFixtures(check: => Unit): Unit = withImages(fixtures)(_ => check)

        it("first page: the walk's first images, with the exact total") {
          withFixtures {
            val body = bodyOf(recorded("search-after-first-page").head)
            val walked = walk(body)
            val json = respond("/images/search-after", body)
            page(json) shouldBe walked.take(page(json).size)
            page(json) should not be empty
            (json \ "total").as[Long] shouldBe walked.size.toLong
          }
        }

        it("cursor page: continues the walk after the tuple at each sampled position") {
          withFixtures {
            val body = bodyOf(recorded("search-after-cursor-taken").head)
            val walked = walk(body)
            val length = (body \ "length").as[Int]
            walked.exists(nullPrimary) shouldBe true
            samples(walked).foreach { k =>
              withClue(s"after position $k: ") {
                page(respond("/images/search-after", body ++ Json.obj("sortValues" -> walked(k)._2))) shouldBe walked.slice(k + 1, k + 1 + length)
              }
            }
          }
        }

        // Missing values sort last in both directions, and a null-primary cursor reads only the null
        // tail, so a reverse page stays within the part (valued or null) its tuple belongs to.
        it("backward page: the images before the tuple at each sampled position, in order") {
          withFixtures {
            val body = bodyOf(recorded("search-after-backward-null-zone-taken").head)
            val walked = walk(body)
            val length = (body \ "length").as[Int]
            val firstNull = walked.indexWhere(nullPrimary)
            firstNull should be > 1
            (samples(walked) :+ (firstNull + 1)).distinct.foreach { k =>
              val partStart = if (nullPrimary(walked(k))) firstNull else 0
              val take = length min (k - partStart)
              if (take > 0) withClue(s"$take before position $k: ") {
                page(respond("/images/search-after", body ++ Json.obj("sortValues" -> walked(k)._2, "length" -> take))) shouldBe walked.slice(k - take, k)
              }
            }
          }
        }

        it("End: the walk's last images") {
          withFixtures {
            val body = bodyOf(recorded("search-after-end-taken").head)
            val walked = walk(body)
            val end = page(respond("/images/search-after", body))
            end shouldBe walked.takeRight((body \ "length").as[Int])
          }
        }

        it("id lookup: exactly the image and tuple the walk has for that id") {
          withFixtures {
            val body = bodyOf(recorded("search-after-ids-lookup-last-used").head)
            val walked = walk(body)
            samples(walked).foreach { k =>
              page(respond("/images/search-after", body ++ Json.obj("ids" -> walked(k)._1))) shouldBe Seq(walked(k))
            }
          }
        }

        it("window: exactly the walk's positions from the recorded offset") {
          withFixtures {
            val body = bodyOf(recorded("window-shallow-credit").head)
            val walked = walk(body)
            val offset = (body \ "offset").as[Int]
            walked.size should be > offset
            page(respond("/images/window", body)) shouldBe walked.slice(offset, offset + (body \ "length").as[Int])
          }
        }

        Seq("rank-last-used", "rank-null-zone-taken", "rank-collection-added").foreach { name =>
          it(s"$name: the rank of the tuple at each sampled position is that position") {
            withFixtures {
              val body = bodyOf(recorded(name).head)
              val walked = walk(body)
              samples(walked).foreach { k =>
                withClue(s"position $k: ") {
                  (respond("/images/rank", body ++ Json.obj("sortValues" -> walked(k)._2)) \ "rank").as[Long] shouldBe k.toLong
                }
              }
            }
          }
        }

        def keys(json: JsValue): Seq[(String, Seq[JsValue])] =
          (json \ "keys").as[Seq[JsValue]].map(key => ((key \ "id").as[String], (key \ "sortValues").as[Seq[JsValue]]))

        it("map key page: the whole walk, ending the continuation") {
          withFixtures {
            val body = bodyOf(recorded("keys-map-first-page-last-used").head)
            val walked = walk(body)
            walked.exists(nullPrimary) shouldBe true
            val json = respond("/images/keys", body)
            keys(json) shouldBe walked
            (json \ "after").toOption shouldBe Some(JsNull)
          }
        }

        it("range key page: continues the walk after the tuple at each sampled position") {
          withFixtures {
            val body = bodyOf(recorded("keys-range-null-zone-taken").head)
            val walked = walk(body)
            samples(walked).foreach { k =>
              withClue(s"after position $k: ") {
                keys(respond("/images/keys", body ++ Json.obj("sortValues" -> walked(k)._2))) shouldBe walked.drop(k + 1).take((body \ "size").as[Int])
              }
            }
          }
        }

        it("keyword page: the walk's primary values in order, counting its valued images") {
          withFixtures {
            val body = bodyOf(recorded("sort-profile-keyword-page-credit").head)
            val walked = walk(body)
            val valued = walked.filterNot(nullPrimary)
            val json = respond("/images/sort-profile", body)
            val buckets = (json \ "buckets").as[Seq[JsValue]]
            buckets.map(b => (b \ "key").as[JsValue]) shouldBe valued.map(_._2.head).distinct
            buckets.map(b => (b \ "count").as[Long]).sum shouldBe valued.size.toLong
            (json \ "coveredCount").as[Long] shouldBe valued.size.toLong
          }
        }

        it("count: the length of a walk of the recorded scope, and a shorter one for the poll interval") {
          withFixtures {
            val sorted = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")))
            val Seq(whole, poll) = Seq("count-tickers", "count-poll-since").map(name => bodyOf(recorded(name).head))
            Seq(whole, poll).foreach { body =>
              (body \ "sort").toOption shouldBe None
              (respond("/images/count", body) \ "total").as[Long] shouldBe walk(body ++ sorted).size.toLong
            }
            walk(poll ++ sorted).size should be < walk(whole ++ sorted).size
          }
        }

        it("aggregations: value, usage-rollup and is: counts describe exactly the walk's images") {
          withFixtures {
            val sorted = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")))
            val body = bodyOf(recorded("aggregations-facets").head)
            (body \ "sort").toOption shouldBe None
            val inScope = walk(body ++ sorted).map(_._1).toSet
            val walkedImages = fixtures.filter(image => inScope(image.id))
            walkedImages should not be empty
            val json = respond("/images/aggregations", body ++ Json.obj("ids" -> fixtures.map(_.id).mkString(",")))
            def counts(field: String): Map[String, Long] = (json \ "fields" \ field \ "buckets").as[Seq[JsValue]]
              .map(b => (b \ "key").as[String] -> (b \ "count").as[Long]).toMap

            counts("metadata.credit") shouldBe walkedImages.flatMap(_.metadata.credit).groupBy(identity).map { case (k, v) => k -> v.size.toLong }
            counts("usagesPlatform") shouldBe Map("digital" -> walkedImages.count(_.usages.nonEmpty).toLong)
            counts("usagesStatus") shouldBe Map("published" -> walkedImages.count(_.usages.nonEmpty).toLong)
            (json \ "isFilterCounts" \ "deleted").as[Long] shouldBe 0L
            (json \ "isFilterCounts" \ "under-quota").as[Long] shouldBe walkedImages.size.toLong
          }
        }

        it("null-zone date profile: stats and buckets describe exactly the walk's null tail") {
          withFixtures {
            val Seq(stats, buckets) = recorded("sort-profile-date-null-zone-taken").map(bodyOf)
            val walked = walk(stats)
            val uploadTimes = walked.filter(nullPrimary).map(_._2(1).as[Long])
            uploadTimes should not be empty
            val statsJson = respond("/images/sort-profile", stats)
            (statsJson \ "valueCount").as[Long] shouldBe uploadTimes.size.toLong
            (statsJson \ "min").as[Long] shouldBe uploadTimes.min
            (statsJson \ "max").as[Long] shouldBe uploadTimes.max
            val bucketsJson = respond("/images/sort-profile", buckets)
            (bucketsJson \ "buckets").as[Seq[JsValue]].map(b => (b \ "count").as[Long]).sum shouldBe uploadTimes.size.toLong
            (bucketsJson \ "positionKind").as[String] shouldBe "exact-rank"
          }
        }

        it("max-mode date profile: covered count is the walk's valued images, buckets are approximate evidence") {
          withFixtures {
            val Seq(stats, buckets) = recorded("sort-profile-date-last-used").map(bodyOf)
            val walked = walk(stats)
            val valued = walked.filterNot(nullPrimary)
            (respond("/images/sort-profile", stats) \ "coveredCount").as[Long] shouldBe valued.size.toLong
            val bucketsJson = respond("/images/sort-profile", buckets)
            (bucketsJson \ "positionKind").as[String] shouldBe "approximate-evidence"
            (bucketsJson \ "evidenceCount").as[Long] shouldBe
              (bucketsJson \ "buckets").as[Seq[JsValue]].map(b => (b \ "count").as[Long]).sum
          }
        }

        it("scoped scalar anchor: null for an absent scope value, within the scoped images' range otherwise") {
          withFixtures {
            val body = bodyOf(recorded("sort-profile-scalar-anchor-scoped-credit").head)
            val walked = walk(body)
            val recordedValue = (body \ "scope" \ 0 \ "value").as[String]
            walked.map(_._2.head) should not contain JsString(recordedValue)
            (respond("/images/sort-profile", body) \ "value").toOption shouldBe Some(JsNull)
            val scoped = walked.filter(_._2.head == JsString("AAP")).map(_._2(1).as[Long])
            scoped should not be empty
            val value = (respond("/images/sort-profile",
              body ++ Json.obj("scope" -> Json.arr(Json.obj("field" -> "metadata.credit", "value" -> "AAP")))) \ "value").as[Double]
            value should (be >= scoped.min.toDouble and be <= scoped.max.toDouble)
          }
        }

        it("mget: exactly the requested images that exist, in request order, without a search scope") {
          withFixtures {
            val body = bodyOf(recorded("mget-selection").head)
            body.keys shouldBe Set("ids")
            val requested = fixtures.map(_.id).reverse ++ (body \ "ids").as[Seq[String]]
            val json = respond("/images/mget", body ++ Json.obj("ids" -> requested))
            (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String]) shouldBe fixtures.map(_.id).reverse
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

    describe("count") {
      implicit val logMarker: LogMarker = MarkerMap()
      val newestFirst = Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      val t0 = DateTime.parse("2020-01-01T00:00:00Z")

      // Parsed rather than built from a Map, whose keys would split "metadata.description" into a path.
      val agencyPicks = Configuration(com.typesafe.config.ConfigFactory.parseString(
        """agencyPicks.ingredients { "metadata.description": ["count-pick"] }"""))
      val tickersConfig = new MediaApiConfig(GridConfigResources(
        agencyPicks.withFallback(Configuration.from(USED_CONFIGS_IN_TEST ++ Map(
          "filters.shouldDisplayOrgOwnedCountAndFilterCheckbox" -> true,
        ) ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap)),
        null,
        applicationLifecycle
      ))
      lazy val ESWithTickers = new ElasticSearch(tickersConfig, mediaApiMetrics, elasticConfig, () => List.empty, mock[Scheduler])

      def countFixture(id: String, usageRights: UsageRights, uploadHour: Int, pick: Boolean): Image = {
        val image = createImage(id, usageRights)
        image.copy(uploadTime = t0.plusHours(uploadHour),
          metadata = image.metadata.copy(description = if (pick) Some("count-pick") else None))
      }
      // Two owned images, three agency picks from two suppliers, one of each kind in the later hours.
      val countFixtures = Seq(
        countFixture("count-owned-early", staffPhotographer, 1, pick = false),
        countFixture("count-pick-getty-early", Agency("Getty Images"), 2, pick = true),
        countFixture("count-plain", Handout(), 3, pick = false),
        countFixture("count-pick-getty-late", Agency("Getty Images"), 4, pick = true),
        countFixture("count-owned-late", staffPhotographer, 5, pick = false),
        countFixture("count-pick-reuters", Agency("Reuters"), 6, pick = true),
      )

      def statusAndJson(response: Future[Result]): (Int, JsValue) = whenReady(response, timeout, interval) { result =>
        (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
      }
      def countVia(search: ElasticSearch, body: JsObject, principal: Principal = uploader, privileged: Boolean = true): (Int, JsValue) =
        statusAndJson(imageQueryControllerFor(principal, search, writer, privileged).countImages()
          .apply(FakeRequest("POST", "/images/count").withBody(body)))
      def d3Total(search: ElasticSearch, body: JsObject, principal: Principal = uploader, privileged: Boolean = true): Long = {
        val (status, json) = statusAndJson(imageQueryControllerFor(principal, search, writer, privileged).searchAfterImages()
          .apply(FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj("sort" -> newestFirst, "countAll" -> true))))
        status shouldBe 200
        (json \ "total").as[Long]
      }
      def ticker(json: JsValue, name: String): JsLookupResult = json \ "tickerCounts" \ name

      it("counts exactly D3's total, with each ticker equal to D3's total under the ticker's own clause") {
        withImages(countFixtures) { base =>
          val (status, counted) = countVia(ESWithTickers, base)

          status shouldBe 200
          (counted \ "total").as[Long] shouldBe d3Total(ESWithTickers, base)
          (counted \ "total").as[Long] shouldBe countFixtures.size.toLong
          (counted \ "tickerCounts").as[JsObject].keys shouldBe Set("GNM-owned", "agency picks")
          (ticker(counted, "GNM-owned") \ "value").as[Long] shouldBe d3Total(ESWithTickers, base ++ Json.obj("q" -> "is:GNM-owned"))
          (ticker(counted, "GNM-owned") \ "value").as[Long] shouldBe 2L
          (ticker(counted, "agency picks") \ "value").as[Long] shouldBe d3Total(ESWithTickers, base ++ Json.obj("q" -> "is:agency-pick"))
          (ticker(counted, "agency picks") \ "value").as[Long] shouldBe 3L
          (ticker(counted, "agency picks") \ "subCounts").as[Map[String, Long]] shouldBe
            Map("Getty Images" -> 2L, "Reuters" -> 1L, "other" -> 0L)
          (ticker(counted, "GNM-owned") \ "subCounts").toOption shouldBe None
        }
      }

      it("reports the same total and tickers as GET /images for the same scope") {
        withImages(countFixtures) { base =>
          val (_, counted) = countVia(ESWithTickers, base)
          val (getStatus, viaGet) = statusAndJson(mediaApiFor(uploader, ESWithTickers, writer, privileged = true).imageSearch()
            .apply(getRequest("ids" -> countFixtures.map(_.id).mkString(","), "countAll" -> "true")))

          getStatus shouldBe 200
          (counted \ "total").as[Long] shouldBe (viaGet \ "total").as[Long]
          (counted \ "tickerCounts").as[JsObject] shouldBe (viaGet \ "actions" \ "tickerCounts").as[JsObject]
        }
      }

      it("counts only the interval after since, excluding an image uploaded exactly then, as D3 does") {
        withImages(countFixtures) { base =>
          val interval = base ++ Json.obj("since" -> t0.plusHours(3).toString)
          val (_, counted) = countVia(ESWithTickers, interval)

          (counted \ "total").as[Long] shouldBe d3Total(ESWithTickers, interval)
          (counted \ "total").as[Long] shouldBe 3L
          (ticker(counted, "GNM-owned") \ "value").as[Long] shouldBe 1L
          (ticker(counted, "agency picks") \ "value").as[Long] shouldBe 2L
          (ticker(counted, "agency picks") \ "subCounts").as[Map[String, Long]] shouldBe
            Map("Getty Images" -> 1L, "Reuters" -> 1L, "other" -> 0L)
        }
      }

      it("reports tickers with no matching images as zero, without sub-counts") {
        withImages(countFixtures) { _ =>
          val (_, counted) = countVia(ESWithTickers, Json.obj("ids" -> "count-plain"))

          (counted \ "total").as[Long] shouldBe 1L
          (ticker(counted, "GNM-owned") \ "value").as[Long] shouldBe 0L
          (ticker(counted, "agency picks") \ "value").as[Long] shouldBe 0L
          (ticker(counted, "agency picks") \ "subCounts").toOption shouldBe None
        }
      }

      it("reports no tickers when none are configured, and still counts") {
        withImages(countFixtures) { base =>
          val (status, counted) = countVia(ES, base)

          status shouldBe 200
          (counted \ "total").as[Long] shouldBe countFixtures.size.toLong
          (counted \ "tickerCounts").as[JsObject] shouldBe Json.obj()
        }
      }

      it("counts the whole admitted scope when the body has no query fields") {
        val (status, counted) = countVia(ES, Json.obj())

        status shouldBe 200
        (counted \ "total").as[Long] shouldBe d3Total(ES, Json.obj())
      }

      it("applies the syndication tier filter exactly as D3 does") {
        val syndication = SearchParams(tier = Syndication, length = 200)
        val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, newestFirst.as[Seq[JsObject]], None, None)), fiveSeconds)
        val counted = Await.result(ES.imageCount(ImageCountParams(syndication, None)), fiveSeconds)

        viaD3.total should be < expectedNumberOfImages.toLong
        counted.total shouldBe viaD3.total
        Await.result(ES.imageCount(ImageCountParams(SearchParams(tier = Internal), None)), fiveSeconds).total shouldBe
          expectedNumberOfImages.toLong
      }

      it("counts within the same deleted scope as D3, for ordinary and privileged callers") {
        val deleted = Seq(uploader, otherUploader).map { principal =>
          createImage(s"count-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
            softDeletedMetadata = Some(deletionData(principal.email)))
        }
        withImages(deleted) { base =>
          val body = base ++ Json.obj("q" -> "is:deleted")
          Seq((uploader, false, 1L), (otherUploader, false, 1L), (uploader, true, 2L)).foreach { case (principal, privileged, expected) =>
            val (status, counted) = countVia(ES, body, principal, privileged)

            status shouldBe 200
            (counted \ "total").as[Long] shouldBe d3Total(ES, body, principal, privileged)
            (counted \ "total").as[Long] shouldBe expected
          }
        }
      }

      it("reads through a size-0 _search with an exact total and the ticker aggregations") {
        val body = Json.parse(SearchBodyBuilderFn(ESWithTickers.imageCountRequest(ImageCountParams(SearchParams(tier = Internal), None))).string)
        (body \ "size").as[Int] shouldBe 0
        (body \ "track_total_hits").as[Boolean] shouldBe true
        (body \ "aggs").as[JsObject].keys shouldBe Set("GNM-owned", "agency picks")
      }

      it("counts identically under a PIT and returns it") {
        withImages(countFixtures) { base =>
          val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)
          val (_, live) = countVia(ESWithTickers, base)
          val (status, pinned) = countVia(ESWithTickers, base ++ Json.obj("pitId" -> pitId))

          status shouldBe 200
          pinned.as[JsObject] - "pitId" shouldBe live
          (pinned \ "pitId").asOpt[String] shouldBe defined
        }
      }

      it("returns the PIT expiry contract for a closed PIT") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val response = for {
          opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
          _ <- client.execute(deletePointInTime(opened.result.id))
          result <- controller.countImages().apply(FakeRequest("POST", "/images/count")
            .withBody(Json.obj("pitId" -> opened.result.id)))
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
          ES.readImageCount(response(timedOut = false, failedShards = 0))._1 shouldBe 42L
        }

        Seq("the search timed out" -> response(timedOut = true, failedShards = 0),
          "a shard failed" -> response(timedOut = false, failedShards = 1)).foreach { case (reason, incomplete) =>
          it(s"refuses to publish a count when $reason") {
            the[Exception] thrownBy ES.readImageCount(incomplete) shouldBe ImageCountIncomplete
          }
        }
      }
    }

    describe("aggregations") {
      implicit val logMarker: LogMarker = MarkerMap()
      val newestFirst = Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))

      def usage(platform: UsageType, status: com.gu.mediaservice.model.usage.UsageStatus): Usage =
        createUsage(ComposerUsageReference, platform, status, DateTime.parse("2020-06-15T00:00:00Z"))
      def aggFixture(id: String, credit: Option[String], usageRights: UsageRights, usages: List[Usage] = Nil): Image = {
        val image = createImage(id, usageRights, usages = usages)
        image.copy(metadata = image.metadata.copy(credit = credit))
      }
      // Three AAP images, one image with two digital and two published usage records, an uncredited illustration.
      val aggFixtures = Seq(
        aggFixture("agg-aap-owned", Some("AAP"), staffPhotographer,
          List(usage(DigitalUsage, PublishedUsageStatus), usage(DigitalUsage, PublishedUsageStatus), usage(PrintUsage, PendingUsageStatus))),
        aggFixture("agg-aap-getty", Some("AAP"), Agency("Getty Images"), List(usage(DigitalUsage, PendingUsageStatus))),
        aggFixture("agg-aap-handout", Some("AAP"), Handout()),
        aggFixture("agg-reuters", Some("Reuters"), Agency("Reuters"), List(usage(PrintUsage, PublishedUsageStatus))),
        aggFixture("agg-illustration", None, StaffIllustrator("Fixture Illustrator")),
      )

      def statusAndJson(response: Future[Result]): (Int, JsValue) = whenReady(response, timeout, interval) { result =>
        (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
      }
      def aggregate(body: JsObject, principal: Principal = uploader, privileged: Boolean = true): (Int, JsValue) =
        statusAndJson(imageQueryControllerFor(principal, ES, writer, privileged).aggregateImages()
          .apply(FakeRequest("POST", "/images/aggregations").withBody(body)))
      def d3Total(body: JsObject, principal: Principal = uploader, privileged: Boolean = true): Long = {
        val (status, json) = statusAndJson(imageQueryControllerFor(principal, ES, writer, privileged).searchAfterImages()
          .apply(FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj("sort" -> newestFirst, "countAll" -> true))))
        status shouldBe 200
        (json \ "total").as[Long]
      }
      def fields(requested: (String, Int)*): JsObject =
        Json.obj("fields" -> requested.map { case (field, size) => Json.obj("field" -> field, "size" -> size) })
      def buckets(json: JsValue, field: String): Seq[(String, Long)] =
        (json \ "fields" \ field \ "buckets").as[Seq[JsValue]].map(b => ((b \ "key").as[String], (b \ "count").as[Long]))
      def filterCount(json: JsValue, name: String): Long = (json \ "isFilterCounts" \ name).as[Long]

      it("counts each value's images, most frequent first, as D3's total for that value") {
        withImages(aggFixtures) { base =>
          val (status, json) = aggregate(base ++ fields("metadata.credit" -> 10))

          status shouldBe 200
          buckets(json, "metadata.credit") shouldBe Seq("AAP" -> 3L, "Reuters" -> 1L)
          buckets(json, "metadata.credit").foreach { case (credit, count) =>
            count shouldBe d3Total(base ++ Json.obj("q" -> s"""credit:"$credit""""))
          }
        }
      }

      it("aggregates field paths verbatim and keeps at most size values, 10 when size is omitted") {
        val uploaders = (1 to 12).map(n => createImage(f"agg-uploader-$n%02d", Handout(), uploadedBy = f"uploader-$n%02d@example.test"))
        withImages(uploaders) { base =>
          val (_, sized) = aggregate(base ++ fields("uploadedBy" -> 3))
          val (_, defaulted) = aggregate(base ++ Json.obj("fields" -> Json.arr(Json.obj("field" -> "uploadedBy"))))

          buckets(sized, "uploadedBy").map(_._2) shouldBe Seq(1L, 1L, 1L)
          buckets(defaulted, "uploadedBy") should have size 10
          buckets(defaulted, "uploadedBy").map(_._1).toSet.subsetOf(uploaders.map(_.uploadedBy).toSet) shouldBe true
        }
      }

      it("counts images, not usage records, on the usage rollups, as a nested count of parent images does") {
        def parentCounts(subField: String): Map[String, Long] = {
          val response = Await.result(client.execute(ElasticDsl.search(index).query(idsQuery(aggFixtures.map(_.id))).size(0)
            .aggregations(nestedAggregation("usages", "usages").subAggregations(
              termsAgg("values", s"usages.$subField").subAggregations(reverseNestedAggregation("parents"))))), fiveSeconds)
          val values = response.result.aggregations.dataAsMap("usages").asInstanceOf[Map[String, Any]]("values").asInstanceOf[Map[String, Any]]
          values("buckets").asInstanceOf[Seq[Map[String, Any]]].map { bucket =>
            bucket("key").toString -> bucket("parents").asInstanceOf[Map[String, Any]]("doc_count").toString.toLong
          }.toMap
        }
        withImages(aggFixtures) { base =>
          val (_, json) = aggregate(base ++ fields("usagesPlatform" -> 20, "usagesStatus" -> 20))

          buckets(json, "usagesPlatform").toMap shouldBe Map("digital" -> 2L, "print" -> 2L)
          buckets(json, "usagesStatus").toMap shouldBe Map("published" -> 2L, "pending" -> 2L)
          buckets(json, "usagesPlatform").toMap shouldBe parentCounts("platform")
          buckets(json, "usagesStatus").toMap shouldBe parentCounts("status")
        }
      }

      it("counts each named is: filter within the admitted scope, keyed as requested, an unknown name as 0") {
        withImages(aggFixtures) { base =>
          val names = Seq("GNM-owned-photo", "GNM-owned-illustration", "under-quota", "deleted", "no-such-filter")
          val (status, json) = aggregate(base ++ Json.obj("isFilters" -> names))

          status shouldBe 200
          (json \ "isFilterCounts").as[JsObject].keys shouldBe names.toSet
          filterCount(json, "GNM-owned-photo") shouldBe 1L
          filterCount(json, "GNM-owned-illustration") shouldBe 1L
          filterCount(json, "under-quota") shouldBe aggFixtures.size.toLong
          Seq("GNM-owned-photo", "GNM-owned-illustration", "under-quota").foreach { name =>
            filterCount(json, name) shouldBe d3Total(base ++ Json.obj("q" -> s"is:$name"))
          }
          filterCount(json, "deleted") shouldBe 0L
          filterCount(json, "no-such-filter") shouldBe 0L
        }
      }

      it("counts deleted images only inside a deleted search, within the caller's deleted scope") {
        val deleted = Seq(uploader, otherUploader).map { principal =>
          createImage(s"agg-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
            softDeletedMetadata = Some(deletionData(principal.email)))
        }
        withImages(deleted) { base =>
          val body = base ++ Json.obj("q" -> "is:deleted", "isFilters" -> Json.arr("deleted")) ++ fields("uploadedBy" -> 10)
          Seq((false, Seq(uploader.email -> 1L)), (true, Seq(uploader.email -> 1L, otherUploader.email -> 1L))).foreach {
            case (privileged, expected) =>
              val (status, json) = aggregate(body, uploader, privileged)

              status shouldBe 200
              buckets(json, "uploadedBy").sorted shouldBe expected.sorted
              filterCount(json, "deleted") shouldBe d3Total(body, uploader, privileged)
              filterCount(json, "deleted") shouldBe expected.size.toLong
          }
        }
      }

      it("never widens an explicitly empty ID list to the whole scope: it fails, as D3 does") {
        withImages(aggFixtures) { _ =>
          val request = fields("metadata.credit" -> 10) ++ Json.obj("isFilters" -> Json.arr("under-quota"))
          val controller = imageQueryControllerFor(uploader, ES, writer, privileged = true)
          val emptyIds = Json.obj("ids" -> "")
          whenReady(controller.aggregateImages().apply(FakeRequest("POST", "/images/aggregations").withBody(request ++ emptyIds)).failed,
            timeout, interval)(_ shouldBe a[com.gu.mediaservice.lib.elasticsearch.ElasticSearchError])
          whenReady(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
            .withBody(emptyIds ++ Json.obj("sort" -> newestFirst))).failed,
            timeout, interval)(_ shouldBe a[com.gu.mediaservice.lib.elasticsearch.ElasticSearchError])

          val (_, whole) = aggregate(request)
          filterCount(whole, "under-quota") shouldBe d3Total(Json.obj())
          filterCount(whole, "under-quota") should be > aggFixtures.size.toLong
        }
      }

      it("applies the syndication tier filter exactly as D3 does") {
        val syndication = SearchParams(tier = Syndication, length = 200)
        val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, newestFirst.as[Seq[JsObject]], None, None)), fiveSeconds)
        val aggregated = Await.result(ES.imageAggregations(ImageAggregationsParams(syndication, Nil, Seq("under-quota"), None)), fiveSeconds)

        viaD3.total should be < expectedNumberOfImages.toLong
        aggregated.result.isFilterCounts shouldBe Seq("under-quota" -> viaD3.total)
      }

      describe("refusals") {
        def refusal(body: JsObject): (Int, String) = {
          val (status, json) = aggregate(body)
          (status, (json \ "errorMessage").asOpt[String].getOrElse(""))
        }

        Seq(
          "a field inside a nested path" -> (fields("usages.platform" -> 20), "nested"),
          "a field Elasticsearch cannot aggregate" -> (fields("metadata.description" -> 10), "cannot be aggregated"),
          "more than 50 fields" -> (fields((1 to 51).map(n => s"fileMetadata.xmp.field$n" -> 10): _*), "at most 50"),
          "a size of 0" -> (fields("metadata.credit" -> 0), "between 1 and 10000"),
          "a size above 10000" -> (fields("metadata.credit" -> 10001), "between 1 and 10000"),
          "an empty field" -> (fields("" -> 10), "non-empty"),
          "a duplicate field" -> (fields("metadata.credit" -> 10, "metadata.credit" -> 20), "duplicate"),
          "more than 20 is: filters" -> (Json.obj("isFilters" -> (1 to 21).map(n => s"filter-$n")), "at most 20"),
          "a duplicate is: filter" -> (Json.obj("isFilters" -> Json.arr("deleted", "deleted")), "duplicate"),
        ).foreach { case (what, (body, message)) =>
          it(s"refuses $what with 422") {
            val (status, errorMessage) = refusal(body)
            status shouldBe 422
            errorMessage should include(message)
          }
        }

        it("accepts the largest sizes and counts") {
          val (status, _) = aggregate(fields((1 to 50).map(n => s"fileMetadata.xmp.field$n" -> 10000): _*) ++
            Json.obj("isFilters" -> (1 to 20).map(n => s"filter-$n")))
          status shouldBe 200
        }
      }

      it("reads through a size-0 _search without a total, one aggregation per field and is: filter") {
        val params = ImageAggregationsParams(SearchParams(tier = Internal),
          Seq(FieldAggregation("metadata.credit", 5), FieldAggregation("fileMetadata.iptc.Edit Status", 7)), Seq("deleted"), None)
        val body = Json.parse(SearchBodyBuilderFn(ES.imageAggregationsRequest(params)).string)
        (body \ "size").as[Int] shouldBe 0
        (body \ "track_total_hits").as[Boolean] shouldBe false
        val aggs = (body \ "aggs").as[JsObject]
        aggs.keys should have size 3
        aggs.values.flatMap(agg => (agg \ "terms" \ "field").asOpt[String]).toSet shouldBe Set("metadata.credit", "fileMetadata.iptc.Edit Status")
        aggs.values.flatMap(agg => (agg \ "terms" \ "size").asOpt[Int]).toSet shouldBe Set(5, 7)
        aggs.values.count(agg => (agg \ "filter").isDefined) shouldBe 1
      }

      it("aggregates identically under a PIT and returns it") {
        withImages(aggFixtures) { base =>
          val body = base ++ fields("metadata.credit" -> 10) ++ Json.obj("isFilters" -> Json.arr("GNM-owned-photo"))
          val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)
          val (_, live) = aggregate(body)
          val (status, pinned) = aggregate(body ++ Json.obj("pitId" -> pitId))

          status shouldBe 200
          pinned.as[JsObject] - "pitId" shouldBe live
          (pinned \ "pitId").asOpt[String] shouldBe defined
        }
      }

      it("returns the PIT expiry contract for a closed PIT") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val response = for {
          opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
          _ <- client.execute(deletePointInTime(opened.result.id))
          result <- controller.aggregateImages().apply(FakeRequest("POST", "/images/aggregations")
            .withBody(Json.obj("pitId" -> opened.result.id)))
        } yield result

        val (status, json) = statusAndJson(response)
        status shouldBe 410
        (json \ "errorKey").as[String] shouldBe "search-after-pit-expired"
      }

      describe("completeness") {
        val params = ImageAggregationsParams(SearchParams(tier = Internal), Nil, Nil, None)
        def response(timedOut: Boolean, failedShards: Int) =
          SearchResponse(1L, timedOut, false, Map.empty, Shards(2, failedShards, 2 - failedShards), None, None, Map.empty,
            SearchHits(Total(0L, "eq"), 0.0, Array.empty))

        it("reads the counts when every shard completed in time") {
          ES.readImageAggregations(params, response(timedOut = false, failedShards = 0)) shouldBe ImageAggregationsResult(Nil, Nil)
        }

        Seq("the search timed out" -> response(timedOut = true, failedShards = 0),
          "a shard failed" -> response(timedOut = false, failedShards = 1)).foreach { case (reason, incomplete) =>
          it(s"refuses to publish counts when $reason") {
            the[Exception] thrownBy ES.readImageAggregations(params, incomplete) shouldBe ImageAggregationsIncomplete
          }
        }
      }
    }

    describe("mget") {
      implicit val logMarker: LogMarker = MarkerMap()

      val live = createImage("mget-live", Handout(), uploadedBy = uploader.email)
      val deletedByOther = createImage("mget-deleted", Handout(), uploadedBy = otherUploader.email,
        softDeletedMetadata = Some(deletionData(otherUploader.email)))
      val replaced = createImage("mget-replaced", Handout(), uploadedBy = uploader.email,
        usages = List(createUsage(ComposerUsageReference, DigitalUsage,
          com.gu.mediaservice.model.usage.ReplacedUsageStatus, DateTime.parse("2020-06-15T00:00:00Z"))))
      val mgetFixtures = Seq(live, deletedByOther, replaced)

      def statusAndJson(response: Future[Result]): (Int, JsValue) = whenReady(response, timeout, interval) { result =>
        (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
      }
      def mget(body: JsValue, principal: Principal = uploader): (Int, JsValue) =
        statusAndJson(imageQueryControllerFor(principal, ES, writer).mgetImages()
          .apply(FakeRequest("POST", "/images/mget").withBody(body)))
      def idsOf(json: JsValue): Seq[String] =
        (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String])
      def singletonStatus(id: String): Int =
        whenReady(mediaApiFor(uploader, ES, writer).getImage(id).apply(FakeRequest("GET", s"/images/$id")), timeout, interval)(_.header.status)

      it("returns each found image once, in request order, and omits missing IDs") {
        withImages(mgetFixtures) { _ =>
          val (status, json) = mget(Json.obj("ids" -> Seq("mget-replaced", "mget-missing", "mget-live", "mget-replaced", "mget-deleted")))

          status shouldBe 200
          idsOf(json) shouldBe Seq("mget-replaced", "mget-live", "mget-deleted")
        }
      }

      it("finds exactly the images GET /images/:id finds, including those a search hides by default") {
        withImages(mgetFixtures) { base =>
          val requested = mgetFixtures.map(_.id) :+ "mget-missing"
          val (_, json) = mget(Json.obj("ids" -> requested))

          idsOf(json).toSet shouldBe requested.filter(id => singletonStatus(id) == 200).toSet
          idsOf(json).toSet shouldBe mgetFixtures.map(_.id).toSet
          assertViaD3(base, Set(live.id))
        }
      }

      it("returns to a syndication-tier caller only images available for syndication, as GET /images/:id does") {
        val requested = images.map(_.id)
        val available = images.filter(_.syndicationRights.exists(_.isAvailableForSyndication)).map(_.id)
        val forSyndication = Await.result(ES.imageMget(ImageMgetParams(requested, Syndication)), fiveSeconds).map(_._1)
        val forInternal = Await.result(ES.imageMget(ImageMgetParams(requested, Internal)), fiveSeconds).map(_._1)

        available should not be empty
        available.size should be < requested.size
        forSyndication shouldBe available
        forInternal shouldBe requested
      }

      it("keeps alias leaves in the source and parses the lean image, as the other image reads do") {
        whenReady(ESWithFieldAliases.imageMget(ImageMgetParams(Seq("test-image-8"), Internal)), timeout, interval) { found =>
          found.map(_._1) shouldBe Seq("test-image-8")
          val wrapper = found.head._2
          (wrapper.source \ "fileMetadata" \ "xmp" \ "org:ProgrammeMaker").asOpt[String] shouldBe Some("xmp programme maker")
          (wrapper.source \ "fileMetadata" \ "iptc" \ "Caption/Abstract").asOpt[String] shouldBe None
          wrapper.instance.fileMetadata.iptc shouldBe empty
        }
      }

      it("keeps every usage and collection date of an image, so callers can take the latest") {
        val t0 = DateTime.parse("2020-01-01T00:00:00Z")
        val image = createImage("mget-dates", Handout(), usages = List(createDigitalUsage(t0.plusDays(2)), createDigitalUsage(t0.plusDays(9))))
          .copy(collections = List(3, 7).map(day => Collection.build(List(s"mget-$day"), ActionData("mget-test", t0.plusDays(day)))))
        withImages(Seq(image)) { _ =>
          val found = Await.result(ES.imageMget(ImageMgetParams(Seq(image.id), Internal)), fiveSeconds)

          found.map(_._1) shouldBe Seq(image.id)
          found.head._2.instance.usages.map(_.dateAdded.map(_.getMillis)) shouldBe image.usages.map(_.dateAdded.map(_.getMillis))
          found.head._2.instance.collections.map(_.actionData.date.getMillis) shouldBe image.collections.map(_.actionData.date.getMillis)
        }
      }

      it("reads one _search of exactly the distinct requested IDs, lean and without a total") {
        val body = Json.parse(SearchBodyBuilderFn(ES.imageMgetRequest(ImageMgetParams(Seq("b", "a", "b"), Internal))).string)

        (body \ "query" \ "ids" \ "values").as[Seq[String]] shouldBe Seq("b", "a")
        (body \ "size").as[Int] shouldBe 2
        (body \ "track_total_hits").as[Boolean] shouldBe false
        (body \ "_source" \ "includes").as[Seq[String]] should not contain "fileMetadata"
        (body \ "timeout").asOpt[String] shouldBe defined
      }

      describe("refusals") {
        Seq(
          "no IDs" -> (Json.obj("ids" -> Json.arr()), 422),
          "more than 200 IDs" -> (Json.obj("ids" -> (1 to 201).map(n => s"mget-$n")), 422),
          "no ids field" -> (Json.obj(), 400),
          "ids that are not strings" -> (Json.obj("ids" -> Json.arr(1, 2)), 400),
          "ids as a comma-separated string" -> (Json.obj("ids" -> "a,b"), 400),
        ).foreach { case (what, (body, expected)) =>
          it(s"refuses $what with $expected") {
            mget(body)._1 shouldBe expected
          }
        }

        it("accepts 200 IDs") {
          mget(Json.obj("ids" -> (1 to 200).map(n => s"mget-$n")))._1 shouldBe 200
        }
      }

      describe("completeness") {
        val params = ImageMgetParams(Seq("a"), Internal)
        def response(timedOut: Boolean, failedShards: Int) =
          SearchResponse(1L, timedOut, false, Map.empty, Shards(2, failedShards, 2 - failedShards), None, None, Map.empty,
            SearchHits(Total(0L, "eq"), 0.0, Array.empty))

        it("reads no images as none found when every shard completed in time") {
          ES.readImageMget(params, response(timedOut = false, failedShards = 0)) shouldBe empty
        }

        Seq("the search timed out" -> response(timedOut = true, failedShards = 0),
          "a shard failed" -> response(timedOut = false, failedShards = 1)).foreach { case (reason, incomplete) =>
          it(s"refuses to report IDs as missing when $reason") {
            the[Exception] thrownBy ES.readImageMget(params, incomplete) shouldBe ImageMgetIncomplete
          }
        }
      }
    }

    describe("keys") {
      implicit val logMarker: LogMarker = MarkerMap()
      val internal = SearchParams(tier = Internal)
      val t0 = DateTime.parse("2020-01-01T00:00:00Z")

      def keysFixture(id: String, takenDay: Option[Int], uploadHour: Int, credit: Option[String], width: Int,
                      collectionDays: Seq[Int], usageDays: Seq[Int], modifiedDay: Option[Int], editStatus: Option[String]): Image = {
        val image = createImage(id, Handout(), usages = usageDays.map(day => createDigitalUsage(t0.plusDays(day))).toList,
          fileMetadata = Some(FileMetadata(iptc = editStatus.map(status => Map("Edit Status" -> status)).getOrElse(Map.empty))))
        image.copy(
          uploadTime   = t0.plusHours(uploadHour),
          lastModified = modifiedDay.map(day => t0.plusDays(day)),
          metadata     = image.metadata.copy(dateTaken = takenDay.map(day => t0.plusDays(day)), credit = credit),
          source       = image.source.copy(dimensions = Some(Dimensions(width = width, height = 600))),
          collections  = collectionDays.map(day => Collection.build(List(s"keys-$day"), ActionData("keys-test", t0.plusDays(day)))).toList,
        )
      }
      // Ties on every primary and on uploadTime within them, and a missing value for each nullable primary;
      // b and g have several usages/collections, so their max-mode position differs from their smallest value.
      val keysFixtures = Seq(
        keysFixture("keys-a", Some(3), 1, Some("AAP"),     800,  Seq(4),    Seq(5),    Some(2), Some("Original")),
        keysFixture("keys-b", Some(3), 1, Some("AAP"),     800,  Seq(2, 9), Seq(2, 9), Some(2), Some("Corrected")),
        keysFixture("keys-c", Some(1), 2, None,            1200, Nil,       Nil,       None,    None),
        keysFixture("keys-d", None,    1, Some("Reuters"), 800,  Seq(4),    Seq(5),    Some(6), Some("Original")),
        keysFixture("keys-e", None,    3, None,            400,  Nil,       Nil,       None,    None),
        keysFixture("keys-f", Some(7), 2, Some("Reuters"), 1200, Seq(9),    Seq(9),    Some(1), Some("Corrected")),
        keysFixture("keys-g", Some(1), 3, Some("AAP"),     400,  Seq(1, 3), Nil,       Some(6), None),
        keysFixture("keys-h", None,    2, Some("Getty"),   800,  Nil,       Nil,       None,    Some("Original")),
        keysFixture("keys-i", Some(3), 3, Some("Getty"),   1200, Seq(2),    Seq(2),    Some(1), None),
      )
      val keysScope = internal.copy(ids = Some(keysFixtures.map(_.id).toList))

      val id = Json.obj("id" -> "asc")
      def plain(field: String, order: String) = Json.obj(field -> order)
      def selectedMax(field: String, order: String, nestedPath: Option[String]) =
        Json.obj(field -> (Json.obj("order" -> order, "mode" -> "max", "missing" -> "_last") ++
          nestedPath.fold(Json.obj())(path => Json.obj("nested" -> Json.obj("path" -> path)))))
      val newestFirst = Seq(plain("uploadTime", "desc"), id)
      val editStatus = "fileMetadata.iptc.Edit Status"

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
      )
      val alwaysValuedPrimary = Set("newest", "oldest", "width descending", "width ascending")

      def keys(searchParams: SearchParams, sort: Seq[JsObject], sortValues: Option[Seq[JsValue]], size: Int,
               pitId: Option[String] = None): ImageKeysRawResults =
        Await.result(ES.imageKeys(ImageKeysParams(searchParams, sort, sortValues, size, pitId)), fiveSeconds)

      def pairs(page: ImageKeysRawResults): Seq[(String, Seq[JsValue])] = page.result.keys.map(key => key.id -> key.sortValues)

      // Each page's after is the next page's start.
      def keysWalk(searchParams: SearchParams, sort: Seq[JsObject], size: Int, pitId: Option[String] = None): Seq[(String, Seq[JsValue])] = {
        def walk(start: Option[Seq[JsValue]], acc: Seq[(String, Seq[JsValue])], pages: Int): Seq[(String, Seq[JsValue])] = {
          val page = keys(searchParams, sort, start, size, pitId)
          page.result.after match {
            case Some(next) if pages < 50 => walk(Some(next), acc ++ pairs(page), pages + 1)
            case _                        => acc ++ pairs(page)
          }
        }
        walk(None, Seq.empty, 0)
      }

      def windowTuples(searchParams: SearchParams, sort: Seq[JsObject]): Seq[(String, Seq[JsValue])] = {
        val page = Await.result(ES.imageWindow(ImageWindowParams(searchParams.copy(offset = 0, length = 100), sort, None)), fiveSeconds)
        page.hits.map(_._1).zip(page.sortValues)
      }

      def refusalOf(params: ImageKeysParams): String =
        whenReady(ES.imageKeys(params).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message
        }

      def statusAndJson(response: Future[Result]): (Int, JsValue) = whenReady(response, timeout, interval) { result =>
        (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
      }

      supportedSorts.foreach { case (name, sort) =>
        it(s"walks exactly the window's positions, ids and tuples, into the null zone: $name") {
          withImages(keysFixtures) { _ =>
            val positioned = windowTuples(keysScope, sort)
            positioned.map(_._1) should contain theSameElementsAs keysFixtures.map(_.id)
            positioned.exists(_._2.head == JsNull) shouldBe !alwaysValuedPrimary(name)

            Seq(2, keysFixtures.size, 100).foreach { size =>
              withClue(s"page size $size: ") { keysWalk(keysScope, sort, size) shouldBe positioned }
            }
            positioned.indices.foreach { k =>
              withClue(s"after position $k (${positioned(k)._2}): ") {
                pairs(keys(keysScope, sort, Some(positioned(k)._2), 3)) shouldBe positioned.slice(k + 1, k + 4)
              }
            }
          }
        }
      }

      it("continues after a full page and reports no continuation once a page runs short") {
        withImages(keysFixtures) { _ =>
          val full = keys(keysScope, newestFirst, None, keysFixtures.size)
          full.result.keys should have size keysFixtures.size.toLong
          full.result.after shouldBe Some(full.result.keys.last.sortValues)

          val beyond = keys(keysScope, newestFirst, full.result.after, keysFixtures.size)
          beyond.result.keys shouldBe empty
          beyond.result.after shouldBe None

          keys(keysScope, newestFirst, None, keysFixtures.size + 1).result.after shouldBe None
        }
      }

      // missing defaults to _last; omitting it must keep the walk equal to the window, null tail included.
      it("agrees with the window when a clause omits missing") {
        withImages(keysFixtures) { _ =>
          val sort = Seq(Json.obj("metadata.dateTaken" -> Json.obj("order" -> "asc")), plain("uploadTime", "asc"), id)
          val positioned = windowTuples(keysScope, sort)
          positioned.exists(_._2.head == JsNull) shouldBe true
          keysWalk(keysScope, sort, 2) shouldBe positioned
        }
      }

      it("reads source-free keys through one _search page of the requested size, without counting a total") {
        val body = Json.parse(SearchBodyBuilderFn(ES.imageKeysRequest(
          ImageKeysParams(internal, newestFirst, None, ImageKeysParams.MaxSize, None))).string)
        (body \ "size").as[Int] shouldBe 10000
        (body \ "_source").as[Boolean] shouldBe false
        (body \ "track_total_hits").as[Boolean] shouldBe false
        (body \ "sort").as[Seq[JsValue]] should have size 2
        (body \ "search_after").toOption shouldBe None
      }

      it("applies the syndication tier filter exactly as D3 does") {
        val syndication = SearchParams(tier = Syndication, length = 200)
        val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, newestFirst, None, None)), fiveSeconds)

        viaD3.total should be < expectedNumberOfImages.toLong
        pairs(keys(syndication, newestFirst, None, ImageKeysParams.MaxSize)) shouldBe viaD3.hits.map(_._1).zip(viaD3.sortValues)
        keys(internal, newestFirst, None, ImageKeysParams.MaxSize).result.keys should have size expectedNumberOfImages.toLong
      }

      it("reads within the same deleted scope as D3, for ordinary and privileged callers") {
        val deleted = Seq(uploader, otherUploader).map { principal =>
          createImage(s"keys-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
            softDeletedMetadata = Some(deletionData(principal.email)))
        }
        withImages(deleted) { base =>
          val body = base ++ Json.obj("q" -> "is:deleted", "sort" -> newestFirst)
          Seq((uploader, false, Set("keys-deleted-Uploader")), (otherUploader, false, Set("keys-deleted-Other")),
            (uploader, true, deleted.map(_.id).toSet)).foreach { case (principal, privileged, expected) =>
            val controller = imageQueryControllerFor(principal, ES, writer, privileged)
            val (_, d3) = statusAndJson(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after").withBody(body)))
            val (status, keyed) = statusAndJson(controller.imageKeys().apply(FakeRequest("POST", "/images/keys").withBody(body)))

            status shouldBe 200
            val keyedIds = (keyed \ "keys").as[Seq[JsValue]].map(key => (key \ "id").as[String]).toSet
            keyedIds shouldBe (d3 \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String]).toSet
            keyedIds shouldBe expected
          }
        }
      }

      it("walks identically under a PIT without leaking _shard_doc into tuples, and returns the PIT") {
        withImages(keysFixtures) { _ =>
          val sort = supportedSorts.toMap.apply("last used ascending")
          val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)

          keysWalk(keysScope, sort, 2, Some(pitId)) shouldBe windowTuples(keysScope, sort)
          keys(keysScope, sort, None, 2, Some(pitId)).pitId shouldBe defined
        }
      }

      it("returns the PIT expiry contract for a closed PIT") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val response = for {
          opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
          _ <- client.execute(deletePointInTime(opened.result.id))
          result <- controller.imageKeys().apply(FakeRequest("POST", "/images/keys")
            .withBody(Json.obj("sort" -> newestFirst, "pitId" -> opened.result.id)))
        } yield result

        val (status, json) = statusAndJson(response)
        status shouldBe 410
        (json \ "errorKey").as[String] shouldBe "search-after-pit-expired"
      }

      val afterEverything = Some(Seq[JsValue](JsNumber(0), JsString("")))
      val multiClause = Seq(plain("metadata.credit", "asc"), plain(editStatus, "desc"), plain("uploadTime", "desc"), id)
      Seq(
        "a page size of zero" -> ImageKeysParams(internal, newestFirst, None, 0, None) -> "size",
        "a page size above 10,000" -> ImageKeysParams(internal, newestFirst, None, 10001, None) -> "size",
        "a non-zero offset" -> ImageKeysParams(internal.copy(offset = 1), newestFirst, None, 10, None) -> "offset",
        "a tuple shorter than the sort" -> ImageKeysParams(internal, newestFirst, Some(Seq(JsNumber(0))), 10, None) -> "length",
        "a null outside the primary slot" -> ImageKeysParams(internal, multiClause,
          Some(Seq(JsString("AAP"), JsNull, JsNumber(0), JsString("x"))), 10, None) -> "null",
        "nulls sorting first" -> ImageKeysParams(internal,
          Seq(Json.obj("metadata.dateTaken" -> Json.obj("order" -> "desc", "missing" -> "_first")), id), None, 10, None) -> "missing",
        "a mode other than max" -> ImageKeysParams(internal, Seq(Json.obj("usages.dateAdded" -> Json.obj("order" -> "desc",
          "mode" -> "min", "nested" -> Json.obj("path" -> "usages"))), id), None, 10, None) -> "mode",
        "an explicit _shard_doc" -> ImageKeysParams(internal, Seq(plain("uploadTime", "desc"), Json.obj("_shard_doc" -> "asc")),
          None, 10, None) -> "_shard_doc",
        "an empty sort" -> ImageKeysParams(internal, Nil, None, 10, None) -> "sort",
        "more than ten sort clauses" -> ImageKeysParams(internal, (1 to 10).map(n => plain(s"field$n", "asc")) :+ id,
          None, 10, None) -> "at most 10",
      ).foreach { case ((what, params), mentioned) =>
        it(s"refuses $what") {
          refusalOf(params) should include(mentioned)
        }
      }

      it("responds 422 to a page size above 10,000") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val (status, _) = statusAndJson(controller.imageKeys().apply(FakeRequest("POST", "/images/keys")
          .withBody(Json.obj("sort" -> newestFirst, "size" -> 10001))))
        status shouldBe 422
      }

      describe("completeness") {
        val params = ImageKeysParams(internal, newestFirst, afterEverything, 10, None)
        def response(timedOut: Boolean, failedShards: Int) =
          SearchResponse(1L, timedOut, false, Map.empty, Shards(2, failedShards, 2 - failedShards), None, None, Map.empty,
            SearchHits(Total(0L, "eq"), 0.0, Array.empty))

        it("reads an empty page as the end when every shard completed in time") {
          ES.readImageKeys(params, response(timedOut = false, failedShards = 0)) shouldBe ImageKeysResult(Nil, None)
        }

        Seq("the search timed out" -> response(timedOut = true, failedShards = 0),
          "a shard failed" -> response(timedOut = false, failedShards = 1)).foreach { case (reason, incomplete) =>
          it(s"refuses to publish a page when $reason") {
            the[Exception] thrownBy ES.readImageKeys(params, incomplete) shouldBe ImageKeysIncomplete
          }
        }
      }
    }

    describe("shared sort admission") {
      implicit val logMarker: LogMarker = MarkerMap()
      val internal = SearchParams(tier = Internal, length = 1)
      val id = Json.obj("id" -> "asc")
      def plain(field: String, order: String) = Json.obj(field -> order)
      def clause(field: String, attributes: (String, JsValue)*) = Json.obj(field -> JsObject(("order" -> JsString("desc")) +: attributes))
      val upload = plain("uploadTime", "desc")
      val max = "mode" -> JsString("max")
      def path(nested: String) = "nested" -> Json.obj("path" -> nested)

      // Each ordered read admits the same sort, so each must refuse the same malformed clause.
      val reads: Seq[(String, Seq[JsObject] => Future[Any])] = Seq(
        "search-after" -> (sort => ES.searchAfter(SearchAfterParams(internal, sort, None, None))),
        "window"       -> (sort => ES.imageWindow(ImageWindowParams(internal, sort, None))),
        "rank"         -> (sort => ES.imageRank(ImageRankParams(internal, sort, Seq.fill[JsValue](sort.length)(JsNumber(0)), None))),
        "sort profile" -> (sort => ES.sortProfile(SortProfileParams(internal, sort, DateStats("uploadTime", None), None))),
        "keys"         -> (sort => ES.imageKeys(ImageKeysParams(internal, sort, None, 10, None))),
      )

      val malformed: Seq[((String, Seq[JsObject]), String)] = Seq(
        "no id suffix"                     -> Seq(upload) -> "id",
        "id before the last clause"        -> Seq(id, upload) -> "id",
        "a nested field without its path"  -> Seq(clause("usages.dateAdded", max), upload, id) -> "nested",
        "a nested field with another path" -> Seq(clause("usages.dateAdded", max, path("collections")), upload, id) -> "nested",
        "a flat field with a nested path"  -> Seq(clause("collections.actionData.date", max, path("collections")), upload, id) -> "nested",
        "collection dates without max"     -> Seq(clause("collections.actionData.date"), upload, id) -> "mode max",
        "usage dates without max"          -> Seq(clause("usages.dateAdded", path("usages")), upload, id) -> "mode max",
      )

      for {
        (read, call)          <- reads
        ((what, sort), named) <- malformed
      } it(s"$read refuses $what") {
        whenReady(call(sort).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message should include(named)
        }
      }

      // Without the path, a null-zone cursor would drop the clause and filter with an exists that matches no image.
      it("refuses a null-zone cursor on a nested field sorted without its path") {
        val withoutPath = Seq(clause("usages.dateAdded", max), upload, id)
        val nullZoneStart = Some(Seq[JsValue](JsNull, JsNumber(0), JsString("x")))
        Seq(
          ES.searchAfter(SearchAfterParams(internal, withoutPath, nullZoneStart, None)),
          ES.imageKeys(ImageKeysParams(internal, withoutPath, nullZoneStart, 10, None)),
        ).foreach { read =>
          whenReady(read.failed, timeout, interval)(_.asInstanceOf[InvalidUriParams].message should include("nested"))
        }
      }
    }

    describe("sort profile") {
      implicit val logMarker: LogMarker = MarkerMap()
      val internal = SearchParams(tier = Internal)
      val t0 = DateTime.parse("2020-01-01T00:00:00Z")
      val Day = 86400000L
      val Hour = 3600000L
      val TenMinutes = 600000L

      def profileFixture(id: String, takenDay: Option[Int], uploadMinute: Int, credit: Option[String], width: Int,
                         usageDays: Seq[Int], collectionDays: Seq[Int]): Image = {
        val image = createImage(id, Handout(), usages = usageDays.map(day => createDigitalUsage(t0.plusDays(day))).toList)
        image.copy(
          uploadTime  = t0.plusMinutes(uploadMinute),
          metadata    = image.metadata.copy(dateTaken = takenDay.map(day => t0.plusDays(day)), credit = credit),
          source      = image.source.copy(dimensions = Some(Dimensions(width = width, height = 600))),
          collections = collectionDays.map(day => Collection.build(List(s"profile-$day"), ActionData("profile-test", t0.plusDays(day)))).toList,
        )
      }
      // Upload times share 10-minute and hour buckets unevenly; dateTaken is missing for d, e and h.
      // b and f have two usages (f's on the same day) and b and g two collections, so image and value
      // counts differ; c, e, g and h have no usages and c, e and h no collections.
      val profileFixtures = Seq(
        profileFixture("profile-a", Some(3), 60,  Some("AAP"),     800,  Seq(5),    Seq(4)),
        profileFixture("profile-b", Some(3), 60,  Some("AAP"),     800,  Seq(2, 9), Seq(2, 9)),
        profileFixture("profile-c", Some(1), 135, None,            1200, Nil,       Nil),
        profileFixture("profile-d", None,    100, Some("Reuters"), 800,  Seq(5),    Seq(4)),
        profileFixture("profile-e", None,    180, None,            400,  Nil,       Nil),
        profileFixture("profile-f", Some(7), 135, Some("Reuters"), 1200, Seq(9, 9), Seq(9)),
        profileFixture("profile-g", Some(1), 205, Some("AAP"),     400,  Nil,       Seq(1, 3)),
        profileFixture("profile-h", None,    170, Some("Getty"),   800,  Nil,       Nil),
        profileFixture("profile-i", Some(3), 180, Some("Getty"),   1200, Seq(2),    Seq(2)),
      )
      val profileScope = internal.copy(ids = Some(profileFixtures.map(_.id).toList))

      val id = Json.obj("id" -> "asc")
      def plain(field: String, order: String) = Json.obj(field -> order)
      def selectedMax(field: String, order: String, nestedPath: Option[String]) =
        Json.obj(field -> (Json.obj("order" -> order, "mode" -> "max", "missing" -> "_last") ++
          nestedPath.fold(Json.obj())(path => Json.obj("nested" -> Json.obj("path" -> path)))))
      val newest        = Seq(plain("uploadTime", "desc"), id)
      val oldest        = Seq(plain("uploadTime", "asc"), id)
      val takenDesc     = Seq(plain("metadata.dateTaken", "desc"), plain("uploadTime", "desc"), id)
      val takenAsc      = Seq(plain("metadata.dateTaken", "asc"), plain("uploadTime", "asc"), id)
      val lastUsedDesc  = Seq(selectedMax("usages.dateAdded", "desc", Some("usages")), plain("uploadTime", "desc"), id)
      val collectionAsc = Seq(selectedMax("collections.actionData.date", "asc", None), plain("uploadTime", "asc"), id)
      val creditAsc     = Seq(plain("metadata.credit", "asc"), plain("uploadTime", "desc"), id)
      val widthAsc      = Seq(plain("source.dimensions.width", "asc"), plain("uploadTime", "desc"), id)

      def profile(operation: SortProfileOperation, sort: Seq[JsObject], searchParams: SearchParams = profileScope,
                  pitId: Option[String] = None): SortProfileRawResults =
        Await.result(ES.sortProfile(SortProfileParams(searchParams, sort, operation, pitId)), fiveSeconds)
      def anchor(field: String, percentile: Double, sort: Seq[JsObject], scope: Seq[(String, String)] = Nil,
                 searchParams: SearchParams = profileScope): Option[Double] =
        profile(ScalarAnchor(field, percentile, scope), sort, searchParams).result.asInstanceOf[ScalarAnchorResult].value
      def dateStats(field: String, missingField: Option[String], sort: Seq[JsObject],
                    searchParams: SearchParams = profileScope): DateStatsResult =
        profile(DateStats(field, missingField), sort, searchParams).result.asInstanceOf[DateStatsResult]
      def dateBuckets(field: String, missingField: Option[String], interval: String, sort: Seq[JsObject]): DateBucketsResult =
        profile(DateBuckets(field, missingField, interval), sort).result.asInstanceOf[DateBucketsResult]

      def positioned(sort: Seq[JsObject]): Seq[Seq[JsValue]] =
        Await.result(ES.imageWindow(ImageWindowParams(profileScope.copy(offset = 0, length = 100), sort, None)), fiveSeconds).sortValues
      def epochMillis(value: JsValue): Long = value.as[Long]
      def bucketTriples(result: DateBucketsResult): Seq[(Long, Long, Long)] =
        result.buckets.map(bucket => (DateTime.parse(bucket.key).getMillis, bucket.count, bucket.startPosition))
      // Bucket start, count and cumulative start position for per-bucket counts already in sort order.
      def withStartPositions(counts: Seq[(Long, Long)]): Seq[(Long, Long, Long)] =
        counts.zip(counts.scanLeft(0L)(_ + _._2)).map { case ((start, count), position) => (start, count, position) }
      // Consecutive sorted values grouped by bucket start: exact ranks, one value per image.
      def groupedBuckets(values: Seq[Long], width: Long): Seq[(Long, Long, Long)] = {
        val starts = values.map(value => value - Math.floorMod(value, width))
        val counts = starts.foldLeft(Vector.empty[(Long, Long)]) {
          case (acc, start) if acc.lastOption.exists(_._1 == start) => acc.init :+ (start -> (acc.last._2 + 1))
          case (acc, start) => acc :+ (start -> 1L)
        }
        withStartPositions(counts)
      }

      def postProfile(controller: controllers.ImageQueryController, body: JsObject): (Int, JsValue) =
        whenReady(controller.sortProfile().apply(FakeRequest("POST", "/images/sort-profile").withBody(body)), timeout, interval) { result =>
          (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
        }

      Seq(
        ("taken descending", takenDesc, "metadata.dateTaken", "day", Day),
        ("taken ascending", takenAsc, "metadata.dateTaken", "day", Day),
        ("newest, fixed 10-minute interval", newest, "uploadTime", "10m", TenMinutes),
        ("oldest, calendar hour interval", oldest, "uploadTime", "hour", Hour),
      ).foreach { case (name, sort, field, bucketInterval, width) =>
        it(s"buckets a scalar date exactly as the window positions it: $name") {
          withImages(profileFixtures) { _ =>
            val valued = positioned(sort).map(_.head).takeWhile(_ != JsNull).map(epochMillis)
            val result = dateBuckets(field, None, bucketInterval, sort)

            result.positionKind shouldBe "exact-rank"
            bucketTriples(result) shouldBe groupedBuckets(valued, width)
            result.evidenceCount shouldBe valued.size.toLong
          }
        }
      }

      Seq("taken descending" -> takenDesc, "last used descending (nested)" -> lastUsedDesc,
        "added to collection ascending" -> collectionAsc).foreach { case (name, sort) =>
        it(s"profiles the null zone's upload times exactly as the window positions them: $name") {
          withImages(profileFixtures) { _ =>
            val nullTail = positioned(sort).dropWhile(_.head != JsNull).map(tuple => epochMillis(tuple(1)))
            val primary = sort.head.keys.head
            nullTail should not be empty

            val result = dateBuckets("uploadTime", Some(primary), "10m", sort)
            result.positionKind shouldBe "exact-rank"
            bucketTriples(result) shouldBe groupedBuckets(nullTail, TenMinutes)
            dateStats("uploadTime", Some(primary), sort).valueCount shouldBe nullTail.size.toLong
          }
        }
      }

      it("reports scalar date stats as the window positions them, without a parent count") {
        withImages(profileFixtures) { _ =>
          val valued = positioned(takenDesc).map(_.head).takeWhile(_ != JsNull).map(epochMillis)
          dateStats("metadata.dateTaken", None, takenDesc) shouldBe
            DateStatsResult(valued.size.toLong, Some(valued.min), Some(valued.max), None)
        }
      }

      Seq(
        ("last used descending (nested)", lastUsedDesc, "usages.dateAdded", true,
          (image: Image) => image.usages.flatMap(_.dateAdded).map(_.getMillis)),
        ("added to collection ascending", collectionAsc, "collections.actionData.date", false,
          (image: Image) => image.collections.map(_.actionData.date.getMillis)),
      ).foreach { case (name, sort, field, descending, valuesOf) =>
        it(s"reports exact parent coverage separately from approximate child-date buckets: $name") {
          withImages(profileFixtures) { _ =>
            val values = profileFixtures.map(valuesOf)
            val stats = dateStats(field, None, sort)
            stats.coveredCount shouldBe Some(positioned(sort).takeWhile(_.head != JsNull).size.toLong)
            stats.coveredCount shouldBe Some(values.count(_.nonEmpty).toLong)
            stats.valueCount shouldBe values.map(_.size).sum.toLong
            stats.min shouldBe Some(values.flatten.min)
            stats.max shouldBe Some(values.flatten.max)

            // Each image counts once in every day bucket holding any of its values.
            val perDay = values.flatMap(_.map(value => value - Math.floorMod(value, Day)).distinct)
              .groupBy(identity).map { case (start, images) => start -> images.size.toLong }.toSeq.sortBy(_._1)
            val result = dateBuckets(field, None, "day", sort)
            result.positionKind shouldBe "approximate-evidence"
            bucketTriples(result) shouldBe withStartPositions(if (descending) perDay.reverse else perDay)
            result.evidenceCount shouldBe perDay.map(_._2).sum
            result.evidenceCount should be > stats.coveredCount.get
          }
        }
      }

      it("anchors the extreme percentiles at the smallest and largest admitted values") {
        withImages(profileFixtures) { _ =>
          val uploads = profileFixtures.map(_.uploadTime.getMillis.toDouble)
          anchor("uploadTime", 0, newest) shouldBe Some(uploads.min)
          anchor("uploadTime", 100, newest) shouldBe Some(uploads.max)
          anchor("uploadTime", 50, newest).get should (be > uploads.min and be < uploads.max)
          anchor("source.dimensions.width", 0, widthAsc) shouldBe Some(400.0)
          anchor("source.dimensions.width", 100, widthAsc) shouldBe Some(1200.0)
        }
      }

      it("anchors a nested field within its nested documents") {
        withImages(profileFixtures) { _ =>
          val usageDates = profileFixtures.flatMap(_.usages.flatMap(_.dateAdded)).map(_.getMillis.toDouble)
          anchor("usages.dateAdded", 0, lastUsedDesc) shouldBe Some(usageDates.min)
          anchor("usages.dateAdded", 100, lastUsedDesc) shouldBe Some(usageDates.max)
        }
      }

      it("narrows the anchor to an equality scope on a sort field") {
        withImages(profileFixtures) { _ =>
          val reuters = Seq("metadata.credit" -> "Reuters")
          anchor("uploadTime", 0, creditAsc, reuters) shouldBe Some(t0.plusMinutes(100).getMillis.toDouble)
          anchor("uploadTime", 100, creditAsc, reuters) shouldBe Some(t0.plusMinutes(135).getMillis.toDouble)
          anchor("uploadTime", 0, creditAsc) shouldBe Some(t0.plusMinutes(60).getMillis.toDouble)
        }
      }

      it("returns no anchor or range when nothing is admitted") {
        val nothing = internal.copy(ids = Some(List("profile-absent")))
        anchor("uploadTime", 50, newest, searchParams = nothing) shouldBe None
        dateStats("uploadTime", None, newest, nothing) shouldBe DateStatsResult(0L, None, None, None)
      }

      it("applies the syndication tier filter exactly as D3 does") {
        val syndication = SearchParams(tier = Syndication, length = 200)
        val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, newest, None, None)), fiveSeconds)

        viaD3.total should be < expectedNumberOfImages.toLong
        dateStats("uploadTime", None, newest, syndication).valueCount shouldBe viaD3.total
        dateStats("uploadTime", None, newest, internal).valueCount shouldBe expectedNumberOfImages.toLong
      }

      it("profiles within the same deleted scope as D3, for ordinary and privileged callers") {
        val deleted = Seq(uploader, otherUploader).map { principal =>
          createImage(s"profile-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
            softDeletedMetadata = Some(deletionData(principal.email)))
        }
        withImages(deleted) { base =>
          val body = base ++ Json.obj("q" -> "is:deleted", "sort" -> newest)
          Seq((uploader, false, 1L), (otherUploader, false, 1L), (uploader, true, 2L)).foreach { case (principal, privileged, expected) =>
            val controller = imageQueryControllerFor(principal, ES, writer, privileged)
            val d3 = whenReady(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after").withBody(body)), timeout, interval) {
              result => Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
            }
            val (status, stats) = postProfile(controller, body ++ Json.obj("operation" -> "date-stats", "field" -> "uploadTime"))

            status shouldBe 200
            (stats \ "valueCount").as[Long] shouldBe (d3 \ "total").as[Long]
            (stats \ "valueCount").as[Long] shouldBe expected
          }
        }
      }

      it("profiles identically under a PIT and returns it") {
        withImages(profileFixtures) { _ =>
          val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)
          val operation = DateBuckets("metadata.dateTaken", None, "day")
          val pinned = profile(operation, takenDesc, pitId = Some(pitId))

          pinned.result shouldBe profile(operation, takenDesc).result
          pinned.pitId shouldBe defined
        }
      }

      it("returns the PIT expiry contract for a closed PIT") {
        val controller = imageQueryControllerFor(uploader, ES, writer)
        val closed = for {
          opened <- client.execute(createPointInTime(Index(index)).keepAlive(1.minute))
          _ <- client.execute(deletePointInTime(opened.result.id))
        } yield opened.result.id
        val pitId = Await.result(closed, fiveSeconds)

        val (status, json) = postProfile(controller, Json.obj("sort" -> newest, "operation" -> "date-stats",
          "field" -> "uploadTime", "pitId" -> pitId))
        status shouldBe 410
        (json \ "errorKey").as[String] shouldBe "search-after-pit-expired"
      }

      it("responds with each operation's typed JSON, keeping an absent anchor as null") {
        withImages(profileFixtures) { base =>
          val controller = imageQueryControllerFor(uploader, ES, writer)
          val (bucketStatus, buckets) = postProfile(controller, base ++ Json.obj("sort" -> takenDesc,
            "operation" -> "date-buckets", "field" -> "metadata.dateTaken", "interval" -> "day"))
          bucketStatus shouldBe 200
          (buckets \ "positionKind").as[String] shouldBe "exact-rank"
          (buckets \ "evidenceCount").as[Long] shouldBe 6L
          (buckets \ "buckets").as[Seq[JsObject]].map(_.keys) should contain only Set("key", "count", "startPosition")
          (buckets \ "pitId").toOption shouldBe None

          val nothing = Json.obj("sort" -> newest, "ids" -> "profile-absent")
          postProfile(controller, nothing ++ Json.obj("operation" -> "scalar-anchor", "field" -> "uploadTime", "percentile" -> 50)) shouldBe
            (200, Json.obj("value" -> JsNull))
          postProfile(controller, nothing ++ Json.obj("operation" -> "date-stats", "field" -> "uploadTime")) shouldBe
            (200, Json.obj("valueCount" -> 0, "min" -> JsNull, "max" -> JsNull))
          val (_, special) = postProfile(controller, base ++ Json.obj("sort" -> lastUsedDesc,
            "operation" -> "date-stats", "field" -> "usages.dateAdded"))
          (special \ "coveredCount").as[Long] shouldBe 5L
        }
      }

      Seq(
        "no operation"              -> Json.obj("field" -> "uploadTime") -> "operation",
        "an unknown operation"      -> Json.obj("operation" -> "terms-aggregation", "field" -> "uploadTime") -> "unsupported",
        "no field"                  -> Json.obj("operation" -> "date-stats") -> "field",
        "an unknown interval"       -> Json.obj("operation" -> "date-buckets", "field" -> "uploadTime", "interval" -> "1w") -> "interval",
        "a non-numeric percentile"  -> Json.obj("operation" -> "scalar-anchor", "field" -> "uploadTime", "percentile" -> "50") -> "percentile",
        "a malformed scope"         -> Json.obj("operation" -> "scalar-anchor", "field" -> "uploadTime", "percentile" -> 50,
          "scope" -> Json.arr(Json.obj("field" -> "metadata.credit"))) -> "scope",
        "a non-string missingField" -> Json.obj("operation" -> "date-stats", "field" -> "uploadTime", "missingField" -> 3) -> "missingField",
        "reverse"                   -> Json.obj("operation" -> "date-stats", "field" -> "uploadTime", "reverse" -> true) -> "reverse",
        "seekToEnd"                 -> Json.obj("operation" -> "date-stats", "field" -> "uploadTime", "seekToEnd" -> true) -> "seekToEnd",
        "a cursor"                  -> Json.obj("operation" -> "date-stats", "field" -> "uploadTime", "sortValues" -> Json.arr(0, "x")) -> "sortValues",
        "a non-scalar after"        -> Json.obj("operation" -> "keyword-page", "field" -> "uploadTime", "after" -> Json.obj("value" -> 1)) -> "after",
        "a non-integer size"        -> Json.obj("operation" -> "keyword-page", "field" -> "uploadTime", "size" -> 2.5) -> "size",
        "a string size"             -> Json.obj("operation" -> "keyword-page", "field" -> "uploadTime", "size" -> "2") -> "size",
        "a non-boolean includeCoveredCount" -> Json.obj("operation" -> "keyword-page", "field" -> "uploadTime",
          "includeCoveredCount" -> "yes") -> "includeCoveredCount",
      ).foreach { case ((what, body), mentioned) =>
        it(s"responds 400 to $what") {
          val (status, json) = postProfile(imageQueryControllerFor(uploader, ES, writer), Json.obj("sort" -> newest) ++ body)
          status shouldBe 400
          (json \ "errorMessage").as[String] should include(mentioned)
        }
      }

      def refusalOf(operation: SortProfileOperation, sort: Seq[JsObject]): String =
        whenReady(ES.sortProfile(SortProfileParams(internal, sort, operation, None)).failed, timeout, interval) { ex =>
          ex shouldBe an[InvalidUriParams]
          ex.asInstanceOf[InvalidUriParams].message
        }

      Seq(
        "a field outside the sort"          -> (ScalarAnchor("lastModified", 50, Nil), newest) -> "lastModified",
        "a missing field that is not the primary" -> (DateBuckets("uploadTime", Some("uploadTime"), "day"), takenDesc) -> "missingField",
        "a scope field outside the sort"    -> (ScalarAnchor("uploadTime", 50, Seq("metadata.credit" -> "AAP")), newest) -> "metadata.credit",
        "a percentile above 100"            -> (ScalarAnchor("uploadTime", 100.5, Nil), newest) -> "percentile",
        "a negative percentile"             -> (ScalarAnchor("uploadTime", -1, Nil), newest) -> "percentile",
        "nulls sorting first"               -> (DateStats("metadata.dateTaken", None),
          Seq(Json.obj("metadata.dateTaken" -> Json.obj("order" -> "desc", "missing" -> "_first")), id)) -> "missing",
        "an empty sort"                     -> (DateStats("uploadTime", None), Seq.empty[JsObject]) -> "sort",
        "collection dates without max mode (stats)" -> (DateStats("collections.actionData.date", None),
          Seq(plain("collections.actionData.date", "desc"), plain("uploadTime", "desc"), id)) -> "mode max",
        "collection dates without max mode (buckets)" -> (DateBuckets("collections.actionData.date", None, "day"),
          Seq(plain("collections.actionData.date", "asc"), plain("uploadTime", "asc"), id)) -> "mode max",
        "nested usage dates without max mode" -> (DateBuckets("usages.dateAdded", None, "day"),
          Seq(Json.obj("usages.dateAdded" -> Json.obj("order" -> "desc", "nested" -> Json.obj("path" -> "usages"))),
            plain("uploadTime", "desc"), id)) -> "mode max",
      ).foreach { case ((what, (operation, sort)), mentioned) =>
        it(s"refuses $what") {
          refusalOf(operation, sort) should include(mentioned)
        }
      }

      it("responds 422 to a field outside the sort") {
        val (status, _) = postProfile(imageQueryControllerFor(uploader, ES, writer), Json.obj("sort" -> newest,
          "operation" -> "date-stats", "field" -> "lastModified"))
        status shouldBe 422
      }

      it("reads through a size-0 _search without counting total hits") {
        val body = Json.parse(SearchBodyBuilderFn(ES.sortProfileRequest(
          SortProfileParams(internal, takenDesc, DateBuckets("metadata.dateTaken", None, "day"), None))).string)
        (body \ "size").as[Int] shouldBe 0
        (body \ "track_total_hits").as[Boolean] shouldBe false
        (body \ "aggs").toOption shouldBe defined
      }

      describe("completeness") {
        val anchorParams = SortProfileParams(internal, newest, ScalarAnchor("uploadTime", 50, Nil), None)
        def response(timedOut: Boolean, failedShards: Int, value: Any) =
          SearchResponse(1L, timedOut, false, Map.empty, Shards(2, failedShards, 2 - failedShards), None, None,
            Map("profile" -> Map("values" -> Map("50.0" -> value))), SearchHits(Total(0L, "eq"), 0.0, Array.empty))

        it("reads the anchor when every shard completed in time, and null as no value") {
          ES.readSortProfile(anchorParams, response(timedOut = false, failedShards = 0, 42.0)) shouldBe ScalarAnchorResult(Some(42.0))
          ES.readSortProfile(anchorParams, response(timedOut = false, failedShards = 0, null)) shouldBe ScalarAnchorResult(None)
        }

        Seq("the search timed out" -> response(timedOut = true, failedShards = 0, 42.0),
          "a shard failed" -> response(timedOut = false, failedShards = 1, 42.0)).foreach { case (reason, incomplete) =>
          it(s"refuses to publish a profile when $reason") {
            the[Exception] thrownBy ES.readSortProfile(anchorParams, incomplete) shouldBe SortProfileIncomplete
          }
        }
      }

      describe("keyword page") {
        val creditDesc = Seq(Json.obj("metadata.credit" -> Json.obj("order" -> "desc")), plain("uploadTime", "desc"), id)
        val widthDesc  = Seq(plain("source.dimensions.width", "desc"), plain("uploadTime", "desc"), id)

        def keywordPage(base: JsObject, sort: Seq[JsObject], field: String, extra: JsObject = Json.obj(),
                        principal: Principal = uploader, privileged: Boolean = false): JsValue = {
          val (status, json) = postProfile(imageQueryControllerFor(principal, ES, writer, privileged),
            base ++ Json.obj("sort" -> sort, "operation" -> "keyword-page", "field" -> field) ++ extra)
          withClue(json) { status shouldBe 200 }
          json
        }
        def bucketsOf(page: JsValue): Seq[(JsValue, Long)] =
          (page \ "buckets").as[Seq[JsObject]].map(bucket => (bucket \ "key").as[JsValue] -> (bucket \ "count").as[Long])
        def afterOf(page: JsValue): Option[JsValue] = (page \ "after").toOption.filter(_ != JsNull)
        // Follows the continuation to an empty page or no continuation.
        def walk(base: JsObject, sort: Seq[JsObject], field: String, size: Int, after: Option[JsValue] = None, pagesLeft: Int = 10): Seq[JsValue] = {
          withClue("the walk did not end:") { pagesLeft should be > 0 }
          val page = keywordPage(base, sort, field, Json.obj("size" -> size) ++ after.fold(Json.obj())(key => Json.obj("after" -> key)))
          if (bucketsOf(page).isEmpty || afterOf(page).isEmpty) Seq(page) else page +: walk(base, sort, field, size, afterOf(page), pagesLeft - 1)
        }
        // Consecutive equal primary values, as the window orders them: one run per keyword bucket.
        def runs(values: Seq[JsValue]): Seq[(JsValue, Long)] = values.foldLeft(Vector.empty[(JsValue, Long)]) {
          case (acc, value) if acc.lastOption.exists(_._1 == value) => acc.init :+ (value -> (acc.last._2 + 1))
          case (acc, value) => acc :+ (value -> 1L)
        }

        Seq(("credit ascending", creditAsc, 3), ("credit descending, object form without missing", creditDesc, 3),
          ("width ascending (numeric keys)", widthAsc, 3), ("width descending (numeric keys)", widthDesc, 3),
          ("upload time descending (date keys)", newest, 6)).foreach { case (name, sort, distinctValues) =>
          it(s"walks the primary values page by page exactly as the window positions them: $name") {
            withImages(profileFixtures) { base =>
              val valued = runs(positioned(sort).map(_.head).takeWhile(_ != JsNull))
              val pages = walk(base, sort, sort.head.keys.head, size = 2)
              valued.size shouldBe distinctValues

              pages.size should be >= 2
              pages.flatMap(bucketsOf) shouldBe valued
              pages.init.foreach(page => afterOf(page) shouldBe Some(bucketsOf(page).last._1))
            }
          }
        }

        it("returns the whole vocabulary in one page by default") {
          withImages(profileFixtures) { base =>
            bucketsOf(keywordPage(base, creditAsc, "metadata.credit")) shouldBe
              runs(positioned(creditAsc).map(_.head).takeWhile(_ != JsNull))
          }
        }

        it("counts every valued image only when asked, independently of the page") {
          withImages(profileFixtures) { base =>
            val valued = positioned(creditAsc).takeWhile(_.head != JsNull).size.toLong
            val first = keywordPage(base, creditAsc, "metadata.credit", Json.obj("size" -> 2, "includeCoveredCount" -> true))

            valued shouldBe 7L
            (first \ "coveredCount").as[Long] shouldBe valued
            bucketsOf(first).map(_._2).sum should be < valued
            (keywordPage(base, creditAsc, "metadata.credit", Json.obj("size" -> 2)) \ "coveredCount").toOption shouldBe None
            (keywordPage(base, widthAsc, "source.dimensions.width", Json.obj("includeCoveredCount" -> true)) \ "coveredCount").as[Long] shouldBe 9L
          }
        }

        it("returns an empty page with no continuation when nothing is admitted") {
          keywordPage(Json.obj("ids" -> "profile-absent"), creditAsc, "metadata.credit", Json.obj("includeCoveredCount" -> true)) shouldBe
            Json.obj("buckets" -> Json.arr(), "after" -> JsNull, "coveredCount" -> 0)
        }

        it("counts an image once for each value it holds when the field has several") {
          withImages(profileFixtures) { base =>
            val page = keywordPage(base, Seq(plain("metadata.keywords", "asc"), id), "metadata.keywords", Json.obj("includeCoveredCount" -> true))

            bucketsOf(page) shouldBe Seq(JsString("es") -> 9L, JsString("test") -> 9L)
            (page \ "coveredCount").as[Long] shouldBe 9L
          }
        }

        it("applies the syndication tier filter exactly as D3 does") {
          val syndication = SearchParams(tier = Syndication, length = 200)
          val uploaderAsc = Seq(plain("uploadedBy", "asc"), plain("uploadTime", "desc"), id)
          def imagesCounted(searchParams: SearchParams): Long =
            profile(KeywordPage("uploadedBy", None, KeywordPage.MaxSize, includeCoveredCount = false), uploaderAsc, searchParams)
              .result.asInstanceOf[KeywordPageResult].buckets.map(_.count).sum
          val viaD3 = Await.result(ES.searchAfter(SearchAfterParams(syndication, newest, None, None)), fiveSeconds)

          viaD3.total should be < expectedNumberOfImages.toLong
          imagesCounted(syndication) shouldBe viaD3.total
          imagesCounted(internal) shouldBe expectedNumberOfImages.toLong
        }

        it("walks within the same deleted scope as D3, for ordinary and privileged callers") {
          val deleted = Seq(uploader, otherUploader).map { principal =>
            createImage(s"keyword-deleted-${principal.lastName}", Handout(), uploadedBy = principal.email,
              softDeletedMetadata = Some(deletionData(principal.email)))
          }
          withImages(deleted) { base =>
            val body = base ++ Json.obj("q" -> "is:deleted")
            Seq((uploader, false, 1L), (otherUploader, false, 1L), (uploader, true, 2L)).foreach { case (principal, privileged, expected) =>
              val controller = imageQueryControllerFor(principal, ES, writer, privileged)
              val d3 = whenReady(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
                .withBody(body ++ Json.obj("sort" -> newest))), timeout, interval) {
                result => Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)
              }
              val counted = bucketsOf(keywordPage(body, Seq(plain("uploadedBy", "asc"), plain("uploadTime", "desc"), id), "uploadedBy",
                principal = principal, privileged = privileged)).map(_._2).sum

              counted shouldBe (d3 \ "total").as[Long]
              counted shouldBe expected
            }
          }
        }

        it("pages identically under a PIT and returns it") {
          withImages(profileFixtures) { _ =>
            val pitId = Await.result(client.execute(createPointInTime(Index(index)).keepAlive(1.minute)).map(_.result.id), fiveSeconds)
            val operation = KeywordPage("metadata.credit", Some(JsString("AAP")), 1, includeCoveredCount = true)
            val pinned = profile(operation, creditAsc, pitId = Some(pitId))

            pinned.result shouldBe profile(operation, creditAsc).result
            pinned.result shouldBe KeywordPageResult(Seq(KeywordBucket(JsString("Getty"), 2L)), Some(JsString("Getty")), Some(7L))
            pinned.pitId shouldBe defined
          }
        }

        Seq(
          "a sort field that is not the primary" -> (KeywordPage("uploadTime", None, 10, false), creditAsc) -> "primary",
          "a field outside the sort"             -> (KeywordPage("metadata.source", None, 10, false), creditAsc) -> "primary",
          "a max-mode primary"                   -> (KeywordPage("metadata.credit", None, 10, false),
            Seq(Json.obj("metadata.credit" -> Json.obj("order" -> "asc", "mode" -> "max")), id)) -> "nested or max-mode",
          "a nested primary"                     -> (KeywordPage("usages.platform", None, 10, false),
            Seq(Json.obj("usages.platform" -> Json.obj("order" -> "asc", "nested" -> Json.obj("path" -> "usages"))), id)) -> "nested or max-mode",
          "a special date primary with max mode" -> (KeywordPage("collections.actionData.date", None, 10, false), collectionAsc) -> "nested or max-mode",
          "a nested primary without its nested path" -> (KeywordPage("usages.platform", None, 10, false),
            Seq(plain("usages.platform", "asc"), id)) -> "nested path usages",
          "a deeper nested primary without its nested path" -> (KeywordPage("usages.printUsageMetadata.sectionCode", None, 10, false),
            Seq(plain("usages.printUsageMetadata.sectionCode", "asc"), id)) -> "nested path usages",
          "a flat field sent as nested"          -> (KeywordPage("metadata.credit", None, 10, false),
            Seq(Json.obj("metadata.credit" -> Json.obj("order" -> "asc", "nested" -> Json.obj("path" -> "usages"))), id)) -> "nested path none",
          "a zero size"                          -> (KeywordPage("metadata.credit", None, 0, false), creditAsc) -> "size",
          "a size above 10,000"                  -> (KeywordPage("metadata.credit", None, 10001, false), creditAsc) -> "size",
        ).foreach { case ((what, (operation, sort)), mentioned) =>
          it(s"refuses a keyword page with $what") {
            refusalOf(operation, sort) should include(mentioned)
          }
        }

        it("accepts the largest page size") {
          withImages(profileFixtures) { base =>
            bucketsOf(keywordPage(base, creditAsc, "metadata.credit", Json.obj("size" -> KeywordPage.MaxSize))).size shouldBe 3
          }
        }

        it("responds 422 to a keyword page off the primary") {
          val (status, _) = postProfile(imageQueryControllerFor(uploader, ES, writer), Json.obj("sort" -> creditAsc,
            "operation" -> "keyword-page", "field" -> "uploadTime"))
          status shouldBe 422
        }

        it("reads one composite page through a size-0 _search, in the clause's direction, after the given key") {
          def bodyOf(operation: KeywordPage, sort: Seq[JsObject]) =
            Json.parse(SearchBodyBuilderFn(ES.sortProfileRequest(SortProfileParams(internal, sort, operation, None))).string)
          val descending = bodyOf(KeywordPage("metadata.credit", Some(JsString("Reuters")), 2, includeCoveredCount = false), creditDesc)
          val composite = descending \ "aggs" \ "profile" \ "composite"

          (descending \ "size").as[Int] shouldBe 0
          (descending \ "track_total_hits").as[Boolean] shouldBe false
          (composite \ "size").as[Int] shouldBe 2
          (composite \ "sources").as[Seq[JsObject]] shouldBe
            Seq(Json.obj("value" -> Json.obj("terms" -> Json.obj("field" -> "metadata.credit", "order" -> "desc"))))
          (composite \ "after").as[JsObject] shouldBe Json.obj("value" -> "Reuters")
          (descending \ "aggs" \ "covered").toOption shouldBe None

          val numeric = bodyOf(KeywordPage("source.dimensions.width", Some(JsNumber(800)), 5, includeCoveredCount = true), widthAsc)
          (numeric \ "aggs" \ "profile" \ "composite" \ "after").as[JsObject] shouldBe Json.obj("value" -> 800)
          (numeric \ "aggs" \ "profile" \ "composite" \ "sources" \ 0 \ "value" \ "terms" \ "order").as[String] shouldBe "asc"
          (numeric \ "aggs" \ "covered" \ "filter").toOption shouldBe defined

          val first = bodyOf(KeywordPage("metadata.credit", None, 2, includeCoveredCount = false), creditAsc)
          (first \ "aggs" \ "profile" \ "composite" \ "after").toOption shouldBe None
        }

        describe("completeness") {
          val pageParams = SortProfileParams(internal, creditAsc, KeywordPage("metadata.credit", None, 2, includeCoveredCount = false), None)
          def response(timedOut: Boolean, failedShards: Int, page: Map[String, Any]) =
            SearchResponse(1L, timedOut, false, Map.empty, Shards(2, failedShards, 2 - failedShards), None, None,
              Map("profile" -> page), SearchHits(Total(0L, "eq"), 0.0, Array.empty))
          val onePage = Map("buckets" -> Seq(Map("key" -> Map("value" -> "AAP"), "doc_count" -> 3)), "after_key" -> Map("value" -> "AAP"))

          it("reads the page and its continuation when every shard completed in time") {
            ES.readSortProfile(pageParams, response(timedOut = false, failedShards = 0, onePage)) shouldBe
              KeywordPageResult(Seq(KeywordBucket(JsString("AAP"), 3L)), Some(JsString("AAP")), None)
            ES.readSortProfile(pageParams, response(timedOut = false, failedShards = 0, Map("buckets" -> Seq.empty))) shouldBe
              KeywordPageResult(Nil, None, None)
          }

          Seq("the search timed out" -> response(timedOut = true, failedShards = 0, onePage),
            "a shard failed" -> response(timedOut = false, failedShards = 1, onePage)).foreach { case (reason, incomplete) =>
            it(s"refuses to publish a keyword page when $reason") {
              the[Exception] thrownBy ES.readSortProfile(pageParams, incomplete) shouldBe SortProfileIncomplete
            }
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
