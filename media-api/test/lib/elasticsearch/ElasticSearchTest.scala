package lib.elasticsearch

import org.apache.pekko.actor.{ActorSystem, Scheduler}
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.{Internal, ReadOnly, Syndication}
import com.gu.mediaservice.lib.config.{CommonConfigFixtures, GridConfigResources}
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig, ElasticSearchExecutions}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.DenySyndicationLease
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus, RemovedUsageStatus, SyndicationUsage, UnknownUsageStatus, ComposerUsageReference, DigitalUsage, FrontUsageReference, InDesignUsageReference, PrintUsage}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import lib.querysyntax._
import lib.{MediaApiConfig, MediaApiMetrics}
import org.joda.time.DateTime
import org.scalatest.concurrent.Eventually
import org.scalatestplus.mockito.MockitoSugar
import play.api.Configuration
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.{JsString, Json}
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.concurrent.ExecutionContext.Implicits.global

class ElasticSearchTest extends ElasticSearchTestBase with Eventually with ElasticSearchExecutions with MockitoSugar with CommonConfigFixtures{

  implicit val request: AuthenticatedRequest[AnyContent, Principal] = mock[AuthenticatedRequest[AnyContent, Principal]]

  private val index = "images"

  private val applicationLifecycle = new ApplicationLifecycle {
    override def addStopHook(hook: () => Future[_]): Unit = {}
    override def stop(): Future[_] = Future.successful(())
  }

  private val mediaApiConfig = new MediaApiConfig(createGridResourcesConfig(commonConfigurations))
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
