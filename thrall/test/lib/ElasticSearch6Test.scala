package lib

import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import com.whisk.docker.{DockerContainer, DockerReadyChecker}
import play.api.Configuration

import scala.concurrent.duration._

class ElasticSearch6Test extends ElasticSearchTestBase {

  val elasticSearchConfig = ElasticSearch6Config("writeAlias", "localhost", 9206, "media-service-test", 1, 0)

  val ES = new ElasticSearch6(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))
  val esContainer = Some(DockerContainer("docker.elastic.co/elasticsearch/elasticsearch:6.6.0")
    .withPorts(9200 -> Some(9206))
    .withEnv("cluster.name=media-service", "xpack.security.enabled=false", "discovery.type=single-node", "network.host=0.0.0.0")
    .withReadyChecker(
      DockerReadyChecker.HttpResponseCode(9200, "/", Some("0.0.0.0")).within(10.minutes).looped(40, 1250.millis)
    )
  )
}