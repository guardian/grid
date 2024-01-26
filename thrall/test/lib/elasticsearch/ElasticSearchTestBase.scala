package lib.elasticsearch

import akka.actor.Scheduler
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import helpers.Fixtures
import org.joda.time.DateTime
import org.scalatest.concurrent.{Eventually, ScalaFutures}
import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatestplus.mockito.MockitoSugar
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.elasticsearch.ElasticsearchContainer
import play.api.libs.json.{JsDefined, JsLookupResult, Json}

import scala.compat.java8.DurationConverters.FiniteDurationops
import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.jdk.CollectionConverters.mapAsJavaMapConverter
import scala.util.Properties

trait ElasticSearchTestBase extends AnyFreeSpec with Matchers with Fixtures with BeforeAndAfterAll with BeforeAndAfterEach with Eventually with ScalaFutures with MockitoSugar {

  val useEsDocker = Properties.envOrElse("USE_DOCKER_FOR_TESTS", "true").toBoolean

  val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  val fiveSeconds = Duration(5, SECONDS)
  val tenSeconds = Duration(10, SECONDS)

  val migrationIndexName = "migration-index"

  override implicit val patienceConfig: PatienceConfig = PatienceConfig(tenSeconds, oneHundredMilliseconds)

  val esContainer: Option[ElasticsearchContainer] = if (useEsDocker) {
    {
      val container = new ElasticsearchContainer("docker.elastic.co/elasticsearch/elasticsearch:7.16.2")
        .withExposedPorts(9200)
        .withAccessToHost(true)
        .withEnv(Map(
          "cluster.name" -> "media-service",
          "xpack.security.enabled" -> "false",
          "discovery.type" -> "single-node",
          "network.host" -> "0.0.0.0"
        ).asJava)
        .waitingFor(Wait.forHttp("/")
          .forPort(9200)
          .forStatusCode(200)
          .withStartupTimeout(180.seconds.toJava)
        )
      container.start()
      Some(container)
    }
  } else None

  val esPort = esContainer.map(_.getMappedPort(9200)).getOrElse(9200)
  val esTestUrl = Properties.envOrElse("ES6_TEST_URL", s"http://localhost:$esPort")

  val elasticSearchConfig = ElasticSearchConfig(
    aliases = ElasticSearchAliases(
      current = "Images_Current",
      migration = "Images_Migration"
    ),
    url = esTestUrl,
    shards = 1,
    replicas = 0
  )



  lazy val ES = new ElasticSearch(elasticSearchConfig, None, mock[Scheduler])

  override def beforeAll {
    super.beforeAll()
    ES.ensureIndexExistsAndAliasAssigned()
    ES.createIndexIfMissing(migrationIndexName)
  }

  override protected def beforeEach(): Unit = {
    super.beforeEach()
    // repeatedly delete and check until there is nothing in ES (deleting before it has
    // settled means that we might fail if we only repeat the count)
    eventually {
      val eventualCount = for {
        // Ensure to reset the state of ES between tests by deleting all documents...
        _ <- ES.client.execute(
          ElasticDsl.deleteByQuery(ES.initialImagesIndex, ElasticDsl.matchAllQuery())
        )
        // ...and then forcing a refresh. These operations need to be done in series
        _ <- ES.client.execute(ElasticDsl.refreshIndex(ES.initialImagesIndex))
        // count the remaining documents
        count <- ES.client.execute(ElasticDsl.count(ES.initialImagesIndex))
      } yield count
      eventualCount.futureValue.result.count shouldBe 0
    }
  }

  override def afterAll: Unit = {
    super.afterAll()

    esContainer foreach { _.stop() }
  }

  def reloadedImage(id: String) = {
    implicit val logMarker: LogMarker = MarkerMap()
    Await.result(ES.getImage(id), fiveSeconds)
  }

  def indexedImage(id: String) = {
    implicit val logMarker: LogMarker = MarkerMap()
    Thread.sleep(1000) // TODO use eventually clause
    Await.result(ES.getImage(id), fiveSeconds)
  }

  def asJsLookup(d: DateTime): JsLookupResult = JsDefined(Json.toJson(d.toString))
}
