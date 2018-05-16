package lib

import lib.elasticsearch.{ElasticSearch, SearchFilters}
import play.api.Configuration

trait ElasticSearchHelper {
  val mediaApiConfig = new MediaApiConfig(Configuration.from(Map("es.cluster" -> "media-service", "es.port" -> "9300")))
  val mediaApiMetrics = new MediaApiMetrics(mediaApiConfig)
  val filters = new SearchFilters(mediaApiConfig)
  val ES = new ElasticSearch(mediaApiConfig, filters, mediaApiMetrics)
}
