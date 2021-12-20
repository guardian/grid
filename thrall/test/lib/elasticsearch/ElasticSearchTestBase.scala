package lib.elasticsearch

import akka.actor.Scheduler
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.whisk.docker.impl.spotify.DockerKitSpotify
import com.whisk.docker.scalatest.DockerTestKit
import com.whisk.docker.{DockerContainer, DockerKit, DockerReadyChecker}
import helpers.Fixtures
import org.joda.time.DateTime
import org.scalatest.concurrent.{Eventually, ScalaFutures}
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach, FreeSpec, Matchers}
import play.api.libs.json.{JsDefined, JsLookupResult, Json}

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.global
import scala.concurrent.duration._
import scala.util.Properties

trait ElasticSearchTestBase extends FreeSpec with Matchers with Fixtures with BeforeAndAfterAll with BeforeAndAfterEach with Eventually with ScalaFutures with DockerKit with DockerTestKit with DockerKitSpotify with MockitoSugar {

  val useEsDocker = Properties.envOrElse("USE_DOCKER_FOR_TESTS", "true").toBoolean
  val esTestUrl = Properties.envOrElse("ES6_TEST_URL", "http://localhost:9200")

  val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  val fiveSeconds = Duration(5, SECONDS)
  val tenSeconds = Duration(10, SECONDS)

  val migrationIndexName = "migration-index"

  override implicit val patienceConfig: PatienceConfig = PatienceConfig(tenSeconds, oneHundredMilliseconds)

  val elasticSearchConfig = ElasticSearchConfig(
    aliases = ElasticSearchAliases(
      current = "Images_Current",
      migration = "Images_Migration"
    ),
    url = esTestUrl,
    cluster = "media-service-test",
    shards = 1,
    replicas = 0
  )

  val esContainer = if (useEsDocker) Some(DockerContainer("docker.elastic.co/elasticsearch/elasticsearch:7.15.2")
    .withPorts(9200 -> Some(9200))
    .withEnv("cluster.name=media-service", "xpack.security.enabled=false", "discovery.type=single-node", "network.host=0.0.0.0")
    .withReadyChecker(
      DockerReadyChecker.HttpResponseCode(9200, "/", Some("0.0.0.0")).within(10.minutes).looped(40, 1250.millis)
    )
  ) else None

  lazy val ES = new ElasticSearch(elasticSearchConfig, None, mock[Scheduler])

  override def beforeAll {
    super.beforeAll()
    ES.ensureAliasAssigned()
    ES.ensureIndexExists(migrationIndexName)
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
  }

  final override def dockerContainers: List[DockerContainer] =
    esContainer.toList ++ super.dockerContainers

  final override val StartContainersTimeout = 1.minute


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
