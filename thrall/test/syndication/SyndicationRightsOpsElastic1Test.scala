package syndication

import lib._
import play.api.Configuration

class SyndicationRightsOpsElastic1Test extends SyndicationRightsOpsTestsBase {

  val thrallConfig = new ThrallConfig(Configuration.from(Map(
    "es.cluster" -> "media-service-test",
    "es.port" -> "9301",
    "es.index.aliases.write" -> "writeAlias"
  )))

  val thrallMetrics = new ThrallMetrics(thrallConfig)

  val ES = new ElasticSearch(thrallConfig, thrallMetrics)

}
