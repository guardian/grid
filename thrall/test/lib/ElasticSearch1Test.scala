package lib

import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import play.api.Configuration

class ElasticSearch1Test extends ElasticSearchTestBase {

  val elasticSearchConfig = ElasticSearchConfig("writeAlias", "localhost", 9301, "media-service-test")

  val ES = new ElasticSearch(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))
  val esContainer = None
}