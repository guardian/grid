package syndication

import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import lib._
import play.api.Configuration

class SyndicationRightsOpsElastic1Test extends SyndicationRightsOpsTestsBase {

  val elasticSearchConfig = ElasticSearchConfig("writeAlias", "localhost", 9301, "media-service-test")

  val ES = new ElasticSearch(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))
  val esContainer = None
}
