package lib

import java.nio.file.{Files, Path, Paths}

import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.whisk.docker.{DockerContainer, DockerReadyChecker, VolumeMapping}
import play.api.Configuration

import scala.concurrent.duration._

class ElasticSearch1Test extends ElasticSearchTestBase {

  val elasticSearchConfig = ElasticSearchConfig("writeAlias", "localhost", 9301, "media-service-test")

  val ES = new ElasticSearch(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))

  def findElasticsearchConfig(): Path = {
    // SBT does some monkey stuff and runs the test from the "thrall" folder compared to IntelliJ that runs it from the root
    val sbtsIdeaOfCwd = Paths.get("").toAbsolutePath

    val cwd = if (sbtsIdeaOfCwd.endsWith("thrall")) {
      sbtsIdeaOfCwd.getParent
    } else {
      sbtsIdeaOfCwd
    }

    cwd.resolve("elasticsearch/test/elasticsearch.yml")
  }

  val esContainer = Some(DockerContainer("elasticsearch:1.7.1")
    .withPorts(9200 -> Some(9201), 9300 -> Some(9301))
    .withVolumes(Seq(VolumeMapping(findElasticsearchConfig().toString, "/usr/share/elasticsearch/config/elasticsearch.yml")))
    .withReadyChecker(
      DockerReadyChecker.HttpResponseCode(9200, "/", Some("0.0.0.0")).within(10.minutes).looped(40, 1250.millis)
    )
  )
}