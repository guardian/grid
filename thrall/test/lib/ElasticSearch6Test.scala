package lib

import com.gu.mediaservice.lib.elasticsearch6.ElasticSearch6Config
import play.api.Configuration

class ElasticSearch6Test extends ElasticSearchTestBase {

  val elasticSearchConfig = ElasticSearch6Config("writeAlias", "localhost", 9206, "media-service-test", 1, 0)

  val ES = new ElasticSearch6(elasticSearchConfig, None)

}
