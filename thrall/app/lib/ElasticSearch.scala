package lib

import com.gu.mediaservice.lib.elasticsearch.ElasticSearch
import lib.Config


object ElasticSearch extends ElasticSearch {

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

}
