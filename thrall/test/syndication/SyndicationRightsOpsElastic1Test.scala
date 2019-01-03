package syndication

import lib._
import play.api.Configuration

class SyndicationRightsOpsElastic1Test extends SyndicationRightsOpsTestsBase {

  val elasticSearchConfig = ElasticSearchConfig("writeAlias", "localhost", 9301, "media-service-test")

  val ES = new ElasticSearch(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))

}
