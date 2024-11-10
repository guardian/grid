package lib.elasticsearch

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchAliases, ElasticSearchConfig}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.testlib.ElasticSearchDockerBase
import com.gu.mediaservice.model.Instance
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import helpers.Fixtures
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterEach
import org.scalatest.concurrent.{Eventually, ScalaFutures}
import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.{JsDefined, JsLookupResult, Json}

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._

trait ElasticSearchTestBase extends AnyFreeSpec with Matchers with Fixtures with ElasticSearchDockerBase with BeforeAndAfterEach with Eventually with ScalaFutures with MockitoSugar {

  def instance: Instance

  val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  val fiveSeconds = Duration(5, SECONDS)
  val tenSeconds = Duration(10, SECONDS)

  def currentIndexName(instance: Instance) = instance.id + "_" + "index"
  def migrationIndexName(instance: Instance) = instance.id + "_" + "migration-index"

  override implicit val patienceConfig: PatienceConfig = PatienceConfig(tenSeconds, oneHundredMilliseconds)

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

  override def beforeAll(): Unit = {
    super.beforeAll()
    ES.ensureIndexExistsAndAliasAssigned(alias = ES.imagesCurrentAlias(instance), index = currentIndexName(instance))
    ES.createIndexIfMissing(migrationIndexName(instance))
  }

  override protected def beforeEach(): Unit = {
    super.beforeEach()
    // repeatedly delete and check until there is nothing in ES (deleting before it has
    // settled means that we might fail if we only repeat the count)
    eventually {
      val eventualCount = for {
        // Ensure to reset the state of ES between tests by deleting all documents...
        _ <- ES.client.execute(
          ElasticDsl.deleteByQuery(currentIndexName(instance), ElasticDsl.matchAllQuery())
        )
        // ...and then forcing a refresh. These operations need to be done in series
        _ <- ES.client.execute(ElasticDsl.refreshIndex(currentIndexName(instance)))
        // count the remaining documents
        count <- ES.client.execute(ElasticDsl.count(currentIndexName(instance)))
      } yield count
      eventualCount.futureValue.result.count shouldBe 0
    }
  }

  override def afterAll(): Unit = {
    super.afterAll()

    esContainer foreach { _.stop() }
  }

  def reloadedImage(id: String) = {
    implicit val logMarker: LogMarker = MarkerMap()
    implicit val i: Instance = instance
    Await.result(ES.getImage(id), fiveSeconds)
  }

  def indexedImage(id: String) = {
    implicit val logMarker: LogMarker = MarkerMap()
    implicit val i: Instance = instance
    Thread.sleep(1000) // TODO use eventually clause
    Await.result(ES.getImage(id), fiveSeconds)
  }

  def asJsLookup(d: DateTime): JsLookupResult = JsDefined(Json.toJson(d.toString))
}
