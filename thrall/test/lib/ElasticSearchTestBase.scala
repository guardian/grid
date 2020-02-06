package lib

import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import com.whisk.docker.impl.spotify.DockerKitSpotify
import com.whisk.docker.scalatest.DockerTestKit
import com.whisk.docker.{DockerContainer, DockerKit, DockerReadyChecker}
import helpers.Fixtures
import org.scalatest.concurrent.{Eventually, ScalaFutures}
import org.scalatest.{BeforeAndAfterAll, FreeSpec, Matchers}

import scala.concurrent.duration._
import scala.util.Properties

trait ElasticSearchTestBase extends FreeSpec with Matchers with Fixtures with BeforeAndAfterAll with Eventually with ScalaFutures with DockerKit with DockerTestKit with DockerKitSpotify {

  val useEsDocker = Properties.envOrElse("ES6_USE_DOCKER", "true").toBoolean
  val es6TestUrl = Properties.envOrElse("ES6_TEST_URL", "http://localhost:9200")

  val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  val fiveSeconds = Duration(5, SECONDS)

  val elasticSearchConfig = ElasticSearch6Config("writeAlias", es6TestUrl, "media-service-test", 1, 0)

  val ES = new ElasticSearch6(elasticSearchConfig, None)
  val esContainer = if (useEsDocker) Some(DockerContainer("docker.elastic.co/elasticsearch/elasticsearch:6.8.6")
    .withPorts(9200 -> Some(9200))
    .withEnv("cluster.name=media-service", "xpack.security.enabled=false", "discovery.type=single-node", "network.host=0.0.0.0")
    .withReadyChecker(
      DockerReadyChecker.HttpResponseCode(9200, "/", Some("0.0.0.0")).within(10.minutes).looped(40, 1250.millis)
    )
  ) else None

  override def beforeAll {
    super.beforeAll()
    ES.ensureAliasAssigned()
  }

  override def afterAll: Unit = {
    super.afterAll()
  }

  final override def dockerContainers: List[DockerContainer] =
    esContainer.toList ++ super.dockerContainers

  final override val StartContainersTimeout = 1.minute
}
