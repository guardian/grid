package controllers

import com.gu.mediaservice.lib.VectorUtils.{firstBasisVector, vectorWithCosineSimilarity}
import com.gu.mediaservice.lib.auth.Authentication.UserPrincipal
import com.gu.mediaservice.lib.aws.{Embedder, S3}
import com.gu.mediaservice.lib.config.{GridConfigResources, ServiceHosts, Services}
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig, ElasticSearchExecutions}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.{ComposerUsageReference, DigitalUsage, ReplacedUsageStatus}
import com.gu.mediaservice.testlib.ElasticSearchDockerBase
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import lib.elasticsearch.{ElasticSearch, Fixtures}
import lib.{ImageResponse, MediaApiConfig, MediaApiMetrics, UsageQuota}
import org.apache.pekko.actor.{ActorSystem, Scheduler}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.{any, anyString, eq => eqTo}
import org.mockito.Mockito.{never, times, verify, verifyNoInteractions, when}
import org.scalatest.concurrent.{Eventually, ScalaFutures}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Seconds, Span}
import play.api.Configuration
import play.api.http.HttpEntity
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.{JsObject, JsValue, Json}
import play.api.mvc.{AnyContentAsEmpty, Result}
import play.api.test.FakeRequest

import java.net.URLEncoder
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

// GET /images AI contract: requests without aiQuery keep the legacy behaviour; aiQuery opts into
// explicit ranking text with q as hard filters.
class MediaApiAiSearchTest extends AnyFunSpec
  with ElasticSearchDockerBase
  with Matchers
  with ScalaFutures
  with Eventually
  with ElasticSearchExecutions
  with Fixtures
  with MediaApiTestSupport {

  override implicit val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(10, Seconds))

  private val index = "images"
  private val applicationLifecycle = new ApplicationLifecycle {
    override def addStopHook(hook: () => Future[_]): Unit = {}
    override def stop(): Future[_] = Future.successful(())
  }

  // Grid's GNM-owned ticker is enabled so pool-scoped ticker counts are observable.
  private val mediaApiConfig = new MediaApiConfig(GridConfigResources(
    Configuration.from(USED_CONFIGS_IN_TEST ++ MOCK_CONFIG_KEYS.map(_ -> NOT_USED_IN_TEST).toMap ++ Map(
      "domain.root" -> "example.test",
      "filters.shouldDisplayOrgOwnedCountAndFilterCheckbox" -> true,
    )),
    null,
    applicationLifecycle
  ))
  private val mediaApiMetrics = new MediaApiMetrics(mediaApiConfig, ActorSystem(), applicationLifecycle)
  private val elasticConfig = ElasticSearchConfig(
    aliases = ElasticSearchAliases(current = "Images_Current", migration = "Images_Migration"),
    url = esTestUrl,
    shards = 1,
    replicas = 0
  )
  private lazy val ES = new ElasticSearch(mediaApiConfig, mediaApiMetrics, elasticConfig, () => List.empty, mock[Scheduler])
  lazy val client = ES.client

  private val s3 = mock[S3]
  when(s3.signUrl(any(), any(), any(), any(), any())).thenReturn("https://signed.example.test/image")
  private val imageResponse = new ImageResponse(mediaApiConfig, s3, mock[UsageQuota])

  private val principal = UserPrincipal("Test", "Uploader", "uploader@example.test")
  private val queryEmbedding: List[Double] = firstBasisVector(256)

  private def fixture(id: String, title: String, credit: String, score: Double, rights: UsageRights, acquired: Boolean): Image = {
    val base = createImage(id, rights, vector = Some(vectorWithCosineSimilarity(256, score)),
      syndicationRights = Some(SyndicationRights(None, Nil, List(com.gu.mediaservice.model.Right("right", Some(acquired), Nil)))))
    base.copy(metadata = base.metadata.copy(title = Some(title), credit = Some(credit)))
  }

  // Only c and d match the bare word "good"; only c and d are credited EPA; a and c are GNM-owned;
  // a and d have acquired rights. Semantic similarity to queryEmbedding orders a > b > c > d.
  // e (deleted) and f (replaced usage) rank highly but are hidden by the parser's default exclusions.
  private val visible = Seq(
    fixture("a", "zero lexical", "AFP", 1.0, staffPhotographer, acquired = true),
    fixture("b", "zero lexical", "AFP", 0.9, Handout(), acquired = false),
    fixture("c", "good lexical", "EPA", 0.8, staffPhotographer, acquired = false),
    fixture("d", "good good lexical", "EPA", 0.7, Handout(), acquired = true),
  )
  private val hiddenByDefault = Seq(
    fixture("e", "deleted semantic", "AFP", 0.95, Handout(), acquired = false)
      .copy(softDeletedMetadata = Some(deletionData("someone@example.test"))),
    fixture("f", "replaced semantic", "AFP", 0.85, Handout(), acquired = false)
      .copy(usages = List(createUsage(ComposerUsageReference, DigitalUsage, ReplacedUsageStatus, DateTime.parse("2020-06-15T00:00:00Z")))),
  )
  private val images = visible ++ hiddenByDefault

  override def beforeAll(): Unit = {
    super.beforeAll()
    ES.ensureIndexExistsAndAliasAssigned()
    implicit val logMarker: LogMarker = MarkerMap()
    Await.ready(Future.sequence(images.map { image =>
      executeAndLog(indexInto(index) id image.id source Json.stringify(Json.toJson(image)), "Indexing test image")
    }), 1.minute)
    eventually(timeout(Span(10, Seconds)))(totalImages shouldBe images.size)
  }

  private def totalImages: Long = Await.result(ES.client.execute(ElasticDsl.search(ES.imagesCurrentAlias)).map(_.result.totalHits), 1.second)

  private def recordingEmbedder(): Embedder = {
    val embedder = mock[Embedder]
    when(embedder.createQueryEmbedding(anyString())(any[LogMarker])).thenReturn(Future.successful(queryEmbedding))
    embedder
  }

  private def aiEnabled(config: MediaApiConfig): Unit = {
    when(config.aiSearchEnabled).thenReturn(true)
    when(config.aiSearchResultLimit).thenReturn(200)
  }

  private def get(params: (String, String)*): FakeRequest[AnyContentAsEmpty.type] = {
    val query = params.map { case (k, v) => s"${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}" }.mkString("&")
    FakeRequest("GET", s"/images?$query")
  }

  private def statusAndJson(response: Future[Result]): (Int, JsValue) = whenReady(response) { result =>
    (result.header.status, Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String))
  }

  private case class Searched(status: Int, json: JsValue, embedder: Embedder) {
    def ids: Seq[String] = (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String])
    def total: Long = (json \ "total").as[Long]
    def entitiesHaveEmbedding: Seq[Boolean] = (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "embedding").isDefined)
    def ticker(name: String): Long = (json \ "actions" \ "tickerCounts" \ name \ "value").as[Long]
    def filteredPool: Option[Long] = (json \ "actions" \ "filterPoolCounts" \ "filteredPool").asOpt[Long]
  }

  private def search(params: (String, String)*): Searched = {
    val embedder = recordingEmbedder()
    val controller = mediaApiFor(principal, ES, imageResponse, embedder = embedder, configure = aiEnabled)
    val (status, json) = statusAndJson(controller.imageSearch().apply(get(params: _*)))
    Searched(status, json, embedder)
  }

  private def embedded(searched: Searched, text: String): Unit =
    verify(searched.embedder, times(1)).createQueryEmbedding(eqTo(text))(any[LogMarker])

  private def neverEmbedded(searched: Searched): Unit =
    verify(searched.embedder, never()).createQueryEmbedding(anyString())(any[LogMarker])

  // Requests whose outcome is decided before any embedding or search: mocked ES proves no ES work.
  private def refusedBeforeWork(params: (String, String)*): (Int, JsValue) = {
    val embedder = recordingEmbedder()
    val search = mock[ElasticSearch]
    val controller = mediaApiFor(principal, search, imageResponse, embedder = embedder, configure = aiEnabled)
    val result = statusAndJson(controller.imageSearch().apply(get(params: _*)))
    verifyNoInteractions(search)
    verifyNoInteractions(embedder)
    result
  }

  private val ai = "useAISearch" -> "true"
  private val allFour = Set("a", "b", "c", "d")

  describe("GET /images AI without aiQuery (legacy, unchanged)") {
    it("ranks by bare q text over the whole pool, embedding exactly that text, and renders embeddings") {
      val searched = search(ai, "q" -> "good")
      searched.status shouldBe 200
      searched.ids.toSet shouldBe allFour
      searched.total shouldBe 4
      searched.ticker("GNM-owned") shouldBe 2
      searched.entitiesHaveEmbedding.distinct shouldBe Seq(true)
      embedded(searched, "good")
    }

    it("keeps the prefilter pool total and tickers independent of the returned length") {
      val searched = search(ai, "q" -> "good", "length" -> "1")
      searched.ids should have size 1
      searched.total shouldBe 4
      searched.ticker("GNM-owned") shouldBe 2
    }

    it("returns filter-pool guidance without embedding for filters only") {
      val searched = search(ai, "q" -> "credit:EPA")
      searched.status shouldBe 200
      searched.ids shouldBe empty
      searched.total shouldBe 0
      searched.filteredPool shouldBe Some(2)
      searched.ticker("GNM-owned") shouldBe 1
      neverEmbedded(searched)
    }

    it("returns filter-pool guidance over everything for an empty q") {
      val searched = search(ai, "q" -> "")
      searched.ids shouldBe empty
      searched.filteredPool shouldBe Some(4)
      neverEmbedded(searched)
    }

    it("ranks by the source image embedding for similar:, without a text embedding") {
      val searched = search(ai, "q" -> "similar:a", "length" -> "4")
      searched.status shouldBe 200
      searched.ids shouldBe Seq("a", "b", "c", "d")
      searched.total shouldBe 4
      searched.entitiesHaveEmbedding.distinct shouldBe Seq(true)
      neverEmbedded(searched)
    }

    it("refuses text plus similar: with 422 before embedding or search") {
      val (status, json) = refusedBeforeWork(ai, "q" -> "similar:a good")
      status shouldBe 422
      (json \ "errorKey").as[String] shouldBe "invalid-uri-parameters"
    }

    it("short-circuits length=0 without embedding or search") {
      val (status, json) = refusedBeforeWork(ai, "q" -> "good", "length" -> "0")
      status shouldBe 200
      (json \ "total").as[Long] shouldBe 0
      (json \ "data").as[Seq[JsValue]] shouldBe empty
    }

    it("retains lexical, semantic and fused weights") {
      search(ai, "q" -> "good", "vecWeight" -> "0", "length" -> "4").ids shouldBe Seq("d", "c")
      search(ai, "q" -> "good", "vecWeight" -> "1", "length" -> "4").ids shouldBe Seq("a", "b", "c", "d")
      search(ai, "q" -> "good", "vecWeight" -> "0.1", "length" -> "4").ids shouldBe Seq("d", "c", "a", "b")
    }

    it("ignores hasRightsAcquired (GRID-014)") {
      search(ai, "q" -> "good", "hasRightsAcquired" -> "true").ids.toSet shouldBe allFour
    }

    it("still counts default-hidden images in filter-pool guidance when q is omitted (pre-existing, unchanged)") {
      val searched = search(ai)
      searched.ids shouldBe empty
      searched.filteredPool shouldBe Some(6)
      neverEmbedded(searched)
    }
  }

  describe("GET /images AI with explicit aiQuery") {
    it("ranks by aiQuery alone and treats bare q words as a hard filter, without rendering embeddings") {
      val searched = search(ai, "q" -> "good", "aiQuery" -> "wildlife")
      searched.status shouldBe 200
      searched.ids shouldBe Seq("c", "d")
      searched.total shouldBe 2
      searched.entitiesHaveEmbedding.distinct shouldBe Seq(false)
      embedded(searched, "wildlife")
    }

    it("narrows the pool with structured chips and keeps pool total and tickers over the filtered pool") {
      val chips = search(ai, "q" -> "credit:AFP", "aiQuery" -> "wildlife")
      chips.ids shouldBe Seq("a", "b")
      chips.total shouldBe 2

      val short = search(ai, "q" -> "good", "aiQuery" -> "wildlife", "length" -> "1")
      short.ids shouldBe Seq("c")
      short.total shouldBe 2
      short.ticker("GNM-owned") shouldBe 1
    }

    it("returns filter-pool guidance without embedding for an empty aiQuery, keeping bare q as a filter") {
      val searched = search(ai, "q" -> "good", "aiQuery" -> "")
      searched.status shouldBe 200
      searched.ids shouldBe empty
      searched.total shouldBe 0
      searched.filteredPool shouldBe Some(2)
      searched.ticker("GNM-owned") shouldBe 1
      neverEmbedded(searched)
    }

    it("applies the default deleted and replaced exclusions whether q is omitted or empty") {
      Seq(Seq.empty[(String, String)], Seq("q" -> "")).foreach { q =>
        val ranked = search(Seq(ai, "aiQuery" -> "wildlife") ++ q: _*)
        ranked.status shouldBe 200
        ranked.ids shouldBe Seq("a", "b", "c", "d")
        ranked.total shouldBe 4
        ranked.ticker("GNM-owned") shouldBe 2

        val guidance = search(Seq(ai, "aiQuery" -> "") ++ q: _*)
        guidance.filteredPool shouldBe Some(4)
        guidance.ticker("GNM-owned") shouldBe 2
      }
    }

    it("refuses aiQuery plus similar: with 422 before embedding or search, empty or not") {
      refusedBeforeWork(ai, "q" -> "similar:a", "aiQuery" -> "wildlife")._1 shouldBe 422
      refusedBeforeWork(ai, "q" -> "similar:a", "aiQuery" -> "")._1 shouldBe 422
    }

    it("short-circuits length=0 without embedding or search") {
      refusedBeforeWork(ai, "q" -> "good", "aiQuery" -> "wildlife", "length" -> "0")._1 shouldBe 200
    }

    it("retains lexical, semantic and fused weights over the aiQuery text") {
      search(ai, "aiQuery" -> "good", "vecWeight" -> "0", "length" -> "4").ids shouldBe Seq("d", "c")
      search(ai, "aiQuery" -> "good", "vecWeight" -> "1", "length" -> "4").ids shouldBe Seq("a", "b", "c", "d")
      search(ai, "aiQuery" -> "good", "vecWeight" -> "0.1", "length" -> "4").ids shouldBe Seq("d", "c", "a", "b")
    }

    it("ignores hasRightsAcquired, as legacy GET does (GRID-014)") {
      search(ai, "q" -> "good", "aiQuery" -> "wildlife", "hasRightsAcquired" -> "true").ids shouldBe Seq("c", "d")
    }

    it("is ignored without useAISearch=true: ordinary search, no embedding, legacy rendering") {
      val searched = search("q" -> "good", "aiQuery" -> "wildlife")
      searched.status shouldBe 200
      searched.ids.toSet shouldBe Set("c", "d")
      searched.entitiesHaveEmbedding.distinct shouldBe Seq(true)
      neverEmbedded(searched)
    }
  }

  describe("hasRightsAcquired control") {
    it("filters through the POST image reads, unlike GET") {
      val controller = imageQueryControllerFor(principal, ES, imageResponse)
      val (status, json) = statusAndJson(controller.searchAfterImages().apply(FakeRequest("POST", "/images/search-after")
        .withBody(Json.obj("q" -> "good", "hasRightsAcquired" -> true, "length" -> 10,
          "sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))))))
      status shouldBe 200
      (json \ "data").as[Seq[JsValue]].map(entity => (entity \ "data" \ "id").as[String]) shouldBe Seq("d")
    }
  }

  describe("root ai-search capability") {
    def rootLinks(aiSearchEnabled: Boolean, denseVectors: Boolean): Map[String, String] = {
      val search = mock[ElasticSearch]
      when(search.includeDenseVectorMappings).thenReturn(denseVectors)
      val controller = mediaApiFor(principal, search, imageResponse, configure = { config =>
        when(config.aiSearchEnabled).thenReturn(aiSearchEnabled)
        when(config.services).thenReturn(new Services("example.test", ServiceHosts.guardianPrefixes, Set.empty))
      })
      val (status, json) = statusAndJson(controller.index.apply(FakeRequest("GET", "/")))
      status shouldBe 200
      (json \ "links").as[Seq[JsObject]].map(link => (link \ "rel").as[String] -> (link \ "href").asOpt[String].getOrElse("")).toMap
    }

    it("is advertised only when AI search is enabled and ES has dense vectors, leaving the search link unchanged") {
      val usable = rootLinks(aiSearchEnabled = true, denseVectors = true)
      val searchHref = usable("search")
      searchHref should startWith("https://media.example.test/images{?q,ids,")
      searchHref should not include "aiQuery"
      usable.get("ai-search") shouldBe Some(searchHref.stripSuffix("}") + ",aiQuery}")

      Seq(rootLinks(aiSearchEnabled = false, denseVectors = true), rootLinks(aiSearchEnabled = true, denseVectors = false),
        rootLinks(aiSearchEnabled = false, denseVectors = false)).foreach { links =>
        links.get("ai-search") shouldBe None
        links - "ai-search" shouldBe usable - "ai-search"
      }
    }
  }
}
