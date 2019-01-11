package syndication

import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import lib._
import play.api.Configuration

class SyndicationRightsOpsElastic6Test extends SyndicationRightsOpsTestsBase {

  val elasticSearchConfig = ElasticSearch6Config("writeAlias", "localhost", 9206, "media-service-test", 1, 0)

  val ES = new ElasticSearch6(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))

}
