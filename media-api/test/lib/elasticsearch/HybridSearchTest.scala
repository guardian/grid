package lib.elasticsearch

import org.apache.pekko.actor.{ActorSystem, Scheduler}
import com.gu.mediaservice.lib.VectorUtils.{firstBasisVector, vectorWithCosineSimilarity}
import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig, ElasticSearchExecutions}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.gu.mediaservice.testlib.ElasticSearchDockerBase
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import lib.{MediaApiConfig, MediaApiMetrics}
import org.scalatest.concurrent.{Eventually, ScalaFutures}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.Configuration
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class HybridSearchTest extends AnyFunSpec
  with ElasticSearchDockerBase
  with Matchers
  with ScalaFutures
  with Eventually
  with ElasticSearchExecutions
  with Fixtures
  with MockitoSugar {

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
  private val elasticConfig = ElasticSearchConfig(
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

  private val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  private val fiveSeconds = Duration(5, SECONDS)

  override def beforeAll(): Unit = {
    super.beforeAll()
    ES.ensureIndexExistsAndAliasAssigned()
  }

  describe("AI / hybrid search") {
    implicit val logMarker: LogMarker = MarkerMap()

    // The vector we'll "search" with - represents the user's query embedding.
    val queryEmbedding: List[Double] = firstBasisVector(256)

    // 256-dim vectors to match the `embedding.cohereEmbedV4.image` dense_vector
    // mapping, each constructed to have a known cosine similarity to the query.
    val vectorWithSemanticScore: Map[Double, List[Double]] = Map(
      1.0 -> vectorWithCosineSimilarity(256, 1.0),
      0.9 -> vectorWithCosineSimilarity(256, 0.9),
      0.8 -> vectorWithCosineSimilarity(256, 0.8),
      0.7 -> vectorWithCosineSimilarity(256, 0.7),
      0.5 -> vectorWithCosineSimilarity(256, 0.5),
      0.0 -> vectorWithCosineSimilarity(256, 0.0),
      -0.5 -> vectorWithCosineSimilarity(256, -0.5),
      -0.9 -> vectorWithCosineSimilarity(256, -0.9),
      -1.0 -> vectorWithCosineSimilarity(256, -1.0)
    )

    def aiImage(id: String, title: String, vector: List[Double]): Image = {
      val base = createImage(id = id, usageRights = Handout(), vector = Some(vector))
      base.copy(metadata = base.metadata.copy(title = Some(title)))
    }

    // Replace the images persisted in ES with exactly `imgs`, so each test
    // reasons about a small, fully controlled set of documents.
    def withOnly(imgs: Seq[Image])(test: => Unit): Unit = {
      purgeTestImages
      Await.ready(saveImages(imgs), 1.minute)
      eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(totalImages shouldBe imgs.size)
      test
    }

    it("joe") {
      val a = aiImage("a", title = "zero lexical", vector = vectorWithSemanticScore(1.0))
      val b = aiImage("b", title = "zero lexical", vector = vectorWithSemanticScore(0.9))
      val c = aiImage("c", title = "good lexical", vector = vectorWithSemanticScore(0.8))
      val d = aiImage("d", title = "good good lexical", vector = vectorWithSemanticScore(0.7))

      withOnly(Seq(a, b, c, d)) {
        val semanticOnlyResults = Await.result(
          ES.hybridSearch("good", queryEmbedding, k = 4, numCandidates = 10, vecWeight = 1.0, filterOpt = None),
          fiveSeconds
        )
        semanticOnlyResults.hits.map(_._1) shouldBe List("a", "b", "c", "d")

        val lexicalOnlyResults = Await.result(
          ES.hybridSearch("good", queryEmbedding, k = 4, numCandidates = 10, vecWeight = 0.0, filterOpt = None),
          fiveSeconds
        )
        // Because we asked for k = 4 but only got 2 back, this confirms
        // the short-circuiting behaviour at vecWeight 0.0, i.e. only the lexical query ran.
        lexicalOnlyResults.hits.map(_._1) shouldBe List("d", "c")

        val weightedHeavilyLexicallyResults = Await.result(
          ES.hybridSearch("good", queryEmbedding, k = 4, numCandidates = 10, vecWeight = 0.1, filterOpt = None),
          fiveSeconds
        )
        // We should now get all 4 because vecWeight > 0
        weightedHeavilyLexicallyResults.hits.map(_._1) shouldBe List("d", "c", "a", "b")

        // We've now proven that the lexical top 2 (d, c) are disjunct from the semantic top 2 (a, b)
        // Therefore, without score filling, the top 2 hybrid results after theoretical min-max norming
        // would have to be the top semantic and the top lexical, i.e. a and d, which both get a score of 1.
        // But thanks to score filling, c can make it into the top 2.
        val equalWeightingResults = Await.result(
          ES.hybridSearch("good", queryEmbedding, k = 2, numCandidates = 10, vecWeight = 0.5, filterOpt = None),
          fiveSeconds
        )
        equalWeightingResults.hits.map(_._1) shouldBe List("d", "c")
        equalWeightingResults.hits.map(_._2.instance) // is there a way to get the score out here?
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
