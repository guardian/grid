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
import play.api.libs.json.{JsString, Json}
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

  describe("AI / hybrid search") {
    implicit val logMarker: LogMarker = MarkerMap()

    // 256-dim vectors to match the `embedding.cohereEmbedV4.image` dense_vector
    // mapping. One-hot vectors are orthogonal and unit-magnitude, so cosine
    // similarity is 1.0 against themselves and 0.0 against each other - which
    // makes the semantic ranking easy to reason about in assertions.
    def oneHot(hotIndex: Int): List[Double] =
      List.tabulate(256)(i => if (i == hotIndex) 1.0 else 0.0)

    def withEmbedding(image: Image, vector: List[Double]): Image =
      image.copy(embedding = Some(Embedding(cohereEmbedV4 = Some(CohereV4Embedding(image = vector)))))

    // The vector we'll "search" with - represents the user's query embedding.
    val queryEmbedding: List[Float] = oneHot(0).map(_.toFloat)

    // Matches the text "kitten" but has NO embedding at all: a pure *lexical*
    // hit. Deliberately un-embedded so it is invisible to the kNN (semantic)
    // side of the search - only the BM25 (lexical) side can ever surface it.
    val lexicalMatch =
      createImage("ai-lexical-match", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("a kitten playing in the garden"), keywords = Some(Set("kitten")))
      )

    // Does NOT match the text at all, but IS the nearest neighbour of the query
    // vector: a pure *semantic* hit. The only image in the fixture set with an
    // embedding, so it is the sole image the kNN side can ever return.
    val semanticMatch = withEmbedding(
      createImage("ai-semantic-match", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("completely unrelated wording"), keywords = Some(Set("unrelated")))
      ),
      oneHot(0)
    )

    // Noise: neither a text match nor an embedding, so neither side of the
    // search can ever surface it.
    val unrelated =
      createImage("ai-unrelated", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("nothing to see here"), keywords = Some(Set("noise")))
      )

    val aiImages = Seq(lexicalMatch, semanticMatch, unrelated)

    // Seed exactly once for the whole describe block: the three tests share the
    // same fixtures, and re-indexing the same ids per-test causes version
    // conflicts (409s) when the suite's match-all purge runs in afterAll.
    lazy val aiImagesIndexed: Unit = {
      Await.ready(saveImages(aiImages), 1.minute)
      eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds)) {
        totalImages shouldBe (expectedNumberOfImages + aiImages.size)
      }
    }

    // k = 2 (not, say, 10) is deliberate: with a small k the search is forced
    // to discriminate. If we asked for more results than we indexed, kNN would
    // return everything and the assertions would pass trivially.
    def hybridSearchIds(vecWeight: Double, k: Int = 2): Seq[String] =
      Await.result(
        ES.hybridSearch(
          query = "kitten",
          queryEmbedding = queryEmbedding,
          k = k,
          numCandidates = 10,
          vecWeight = vecWeight,
          filterOpt = None
        ),
        fiveSeconds
      ).hits.map(_._1)

    it("combines lexical (BM25) and semantic (kNN) search, retrieving images by meaning even when the text doesn't match, and fusing the two rankings") {
      aiImagesIndexed

      val ids = hybridSearchIds(vecWeight = 0.5)

      // Semantic recall: the nearest-vector image is returned even though it
      // shares no words with the query - only the kNN path could have found it.
      ids should contain("ai-semantic-match")

      // Lexical recall still works alongside semantic recall.
      ids should contain("ai-lexical-match")

      // The meaningful assertion: the noise image is neither a text match nor a
      // near vector, so fusion + top-k ranking drops it. This is what proves the
      // search actually discriminates rather than just returning everything.
      ids should not contain "ai-unrelated"
    }

    it("ranks the semantic match above the lexical match when vecWeight is cranked towards vectors") {
      aiImagesIndexed

      // vecWeight ~1 => the fused score is dominated by cosine similarity, so the
      // pure-vector match should outrank the pure-text match.
      val ids = hybridSearchIds(vecWeight = 0.99)

      ids should contain("ai-semantic-match")
      ids should contain("ai-lexical-match")
      ids.indexOf("ai-semantic-match") should be < ids.indexOf("ai-lexical-match")
    }

    it("ranks the lexical match above the semantic match when vecWeight is cranked towards text") {
      aiImagesIndexed

      // vecWeight ~0 => the fused score is dominated by BM25, so the pure-text
      // match should outrank the pure-vector match. The mirror image of the above.
      val ids = hybridSearchIds(vecWeight = 0.01)

      ids should contain("ai-semantic-match")
      ids should contain("ai-lexical-match")
      ids.indexOf("ai-lexical-match") should be < ids.indexOf("ai-semantic-match")
    }

    it("short-circuits to a pure lexical (BM25) search when vecWeight is exactly 0, skipping the semantic side entirely") {
      aiImagesIndexed

      // vecWeight == 0 => the semantic side contributes nothing to the fused
      // score, so the kNN query should be skipped altogether. The only result
      // should be the text match; the semantic-only image must not leak in via
      // the kNN path.
      val ids = hybridSearchIds(vecWeight = 0)

      ids shouldEqual Seq("ai-lexical-match")
    }

    it("short-circuits to a pure semantic (kNN) search when vecWeight is exactly 1, skipping the lexical side entirely") {
      aiImagesIndexed

      // vecWeight == 1 => the lexical side contributes nothing to the fused
      // score, so the BM25 query should be skipped altogether. The only result
      // should be the vector match; the lexical-only image must not leak in via
      // the BM25 path.
      val ids = hybridSearchIds(vecWeight = 1)

      ids shouldEqual Seq("ai-semantic-match")
    }

    // ----------------------------------------------------------------------
    // Score "cross-pollination": every candidate is scored on BOTH dimensions,
    // regardless of which side of the search originally surfaced it.
    //
    // A hit found only by the lexical side still has its true cosine similarity
    // filled in client-side; a hit found only by the semantic side still carries
    // the BM25 score it earns from the lexical rescore. The two tests below pin
    // down each of those behaviours in isolation.
    //
    // They use their own query word + vector axis (so the fixtures above can't
    // interfere) and a few small unit vectors with hand-picked cosine values.
    // ----------------------------------------------------------------------

    // Builds a 256-dim unit vector from (index -> value) components. Used to make
    // vectors with specific cosine similarities to a one-hot query axis, e.g.
    // unitVector(7 -> 0.8, 8 -> 0.6) has cosine 0.8 with oneHot(7).
    def unitVector(components: (Int, Double)*): List[Double] = {
      val arr = Array.fill(256)(0.0)
      components.foreach { case (i, v) => arr(i) = v }
      arr.toList
    }

    def hybridSearchIdsFor(query: String, queryEmbedding: List[Float], vecWeight: Double, k: Int): Seq[String] =
      Await.result(
        ES.hybridSearch(
          query = query,
          queryEmbedding = queryEmbedding,
          k = k,
          numCandidates = 10,
          vecWeight = vecWeight,
          filterOpt = None
        ),
        fiveSeconds
      ).hits.map(_._1)

    // Test 1 fixtures - query axis oneHot(7), query word "axolotl".
    //
    // A lexical hit that the kNN side never returns. Its embedding sits at cosine
    // 0.5 from the query, but 'ai-semantic-hit-near-vector' (cosine 0.8) is nearer,
    // so with k = 1 the semantic side only ever returns the latter - leaving this
    // image strictly outside the top-k semantic results.
    val lexicalHitWithVector = withEmbedding(
      createImage("ai-lexical-hit-with-vector", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("a lone axolotl"), keywords = Some(Set("axolotl")))
      ),
      unitVector(7 -> 0.5, 8 -> math.sqrt(0.75))
    )

    // The nearer vector, with no text match: the only image the kNN side returns
    // for the query above.
    val semanticHitNearVector = withEmbedding(
      createImage("ai-semantic-hit-near-vector", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("the blurst of times"))
      ),
      unitVector(7 -> 0.8, 8 -> 0.6)
    )

    // Test 2 fixtures - query axis oneHot(9), query phrase "narwhal arctic ocean".
    //
    // A semantic hit that the lexical side never returns. It is one of the two
    // nearest vectors AND a (weak) text match for "narwhal", but the two strong
    // lexical matches below outscore it on BM25, so with k = 2 it falls strictly
    // outside the top-k lexical results.
    val semanticHitWithText = withEmbedding(
      createImage("ai-semantic-hit-with-text", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("a narwhal"))
      ),
      unitVector(9 -> 0.9, 10 -> math.sqrt(0.19))
    )

    // Equally close to the query vector as 'ai-semantic-hit-with-text' (cosine
    // 0.9), but with no text match at all - so its lexical score is zero. The
    // identical semantic score is what lets us attribute any ranking difference
    // purely to the lexical contribution.
    val semanticHitNoText = withEmbedding(
      createImage("ai-semantic-hit-no-text", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("the blurst of times"))
      ),
      unitVector(9 -> 0.9, 11 -> math.sqrt(0.19))
    )

    // Two strong, un-embedded lexical matches that fill the top-k lexical results
    // and push 'ai-semantic-hit-with-text' out of them. The first matches all
    // three query terms, the second matches two.
    val lexicalStrongOne =
      createImage("ai-lexical-strong-1", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("narwhal arctic ocean"))
      )
    val lexicalStrongTwo =
      createImage("ai-lexical-strong-2", staffPhotographer).copy(
        metadata = ImageMetadata(title = Some("narwhal arctic"))
      )

    val contributionImages = Seq(
      lexicalHitWithVector,
      semanticHitNearVector,
      semanticHitWithText,
      semanticHitNoText,
      lexicalStrongOne,
      lexicalStrongTwo
    )

    // Seed once, on top of the aiImages above, so the total is deterministic no
    // matter which tests run.
    lazy val contributionImagesIndexed: Unit = {
      aiImagesIndexed
      Await.ready(saveImages(contributionImages), 1.minute)
      eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds)) {
        totalImages shouldBe (expectedNumberOfImages + aiImages.size + contributionImages.size)
      }
    }

    it("scores a lexical-only hit by its embedding, even though the kNN side never returned it") {
      contributionImagesIndexed

      val query = "axolotl"
      val queryVector = oneHot(7).map(_.toFloat)

      // A pure semantic search returns only the nearer vector - proving the
      // lexical hit is genuinely outside the top-k semantic results.
      hybridSearchIdsFor(query, queryVector, vecWeight = 1.0, k = 1) shouldEqual Seq("ai-semantic-hit-near-vector")

      // At a strongly semantic-leaning weight the lexical-only hit nonetheless
      // wins. It can only do so because its true cosine similarity (0.5) was
      // filled in client-side: had its semantic score been treated as absent, the
      // nearer vector (0.8) would have taken the single slot at this weight.
      hybridSearchIdsFor(query, queryVector, vecWeight = 0.8, k = 1) shouldEqual Seq("ai-lexical-hit-with-vector")
    }

    it("scores a semantic-only hit by BM25, even though the lexical side never returned it") {
      contributionImagesIndexed

      val query = "narwhal arctic ocean"
      val queryVector = oneHot(9).map(_.toFloat)

      // A pure lexical search returns the two strong text matches and not
      // 'ai-semantic-hit-with-text' - proving it is genuinely outside the top-k
      // lexical results.
      val pureLexical = hybridSearchIdsFor(query, queryVector, vecWeight = 0.0, k = 2)
      pureLexical should contain("ai-lexical-strong-1")
      pureLexical should contain("ai-lexical-strong-2")
      pureLexical should not contain "ai-semantic-hit-with-text"

      // The two semantic hits are equidistant from the query vector, so their
      // semantic scores are identical and both rise above the lexical matches at
      // this weight. The ONLY thing that can separate them is the weak BM25 score
      // the text-bearing one picked up via the semantic-side rescore - so it must
      // rank first.
      hybridSearchIdsFor(query, queryVector, vecWeight = 0.6, k = 2) shouldEqual
        Seq("ai-semantic-hit-with-text", "ai-semantic-hit-no-text")
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
