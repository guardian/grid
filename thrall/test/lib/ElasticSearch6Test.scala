package lib

import play.api.Configuration

class ElasticSearch6Test extends ElasticSearchTestBase {

  val elasticSearchConfig = ElasticSearch6Config("writeAlias", "localhost", 9206, "media-service-test", 1, 0)

  val ES = new ElasticSearch6(elasticSearchConfig, new ThrallMetrics(new ThrallConfig(Configuration.empty)))

}