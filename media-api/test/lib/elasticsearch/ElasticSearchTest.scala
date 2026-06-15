package lib.elasticsearch

import org.apache.pekko.actor.{ActorSystem, Scheduler}
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.{Internal, ReadOnly, Syndication}
import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig, ElasticSearchExecutions}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.DenySyndicationLease
import com.gu.mediaservice.model.usage.PublishedUsageStatus
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import lib.querysyntax._
import lib.{MediaApiConfig, MediaApiMetrics}
import org.joda.time.DateTime
import org.scalatest.concurrent.Eventually
import org.scalatestplus.mockito.MockitoSugar
import play.api.Configuration
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.{JsNull, JsNumber, JsString, Json}
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}
import scala.concurrent.ExecutionContext.Implicits.global

class ElasticSearchTest extends ElasticSearchTestBase with Eventually with ElasticSearchExecutions with MockitoSugar {

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
      publishedAgencyImages.size shouldBe 2

      // Reporting date range is implemented as round down to last full day
      val withinReportedDateRange = publishedAgencyImages.filter(i => i.usages.
        exists(u => u.dateAdded.exists(_.isBefore(DateTime.now.withTimeAtStartOfDay()))))
      withinReportedDateRange.size shouldBe 1

      val results = Await.result(ES.usageForSupplier("ACME", 5), fiveSeconds)

      results.count shouldBe 1
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

  describe("searchAfter") {
    // Mirrors the default kupua sort clause: uploadTime desc, id asc as tiebreaker
    val sortClause = Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))

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
      // produces the same disjoint paging as plain null-zone. (deviations.md §33 records the
      // benign Scala/TS ordering difference behind this no-op.)
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
