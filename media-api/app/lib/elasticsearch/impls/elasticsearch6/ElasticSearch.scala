package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.elasticsearch6.ElasticSearchClient
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.http.ElasticDsl
import com.sksamuel.elastic4s.http.ElasticDsl._
import lib.elasticsearch._
import lib.{MediaApiConfig, MediaApiMetrics, SupplierUsageSummary}
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}
import scala.util.Try

class ElasticSearch(config: MediaApiConfig, mediaApiMetrics: MediaApiMetrics) extends ElasticSearchVersion with ElasticSearchClient {

  lazy val imagesAlias = config.imagesAlias
  lazy val host = "localhost"
  lazy val port = 9206
  lazy val cluster = "media-service"

  lazy val shards = 1
  lazy val replicas = 0

  override def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[Image]] = ???

  override def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults] = {
    val searchRequest = ElasticDsl.search(imagesAlias)

    client.execute(searchRequest).map { r =>
      val hits = r.result.hits.hits.map { h =>
        Try {
          val image = Json.toJson(h.sourceAsString).as[Image]
          (image.id, image)
        }.toOption
      }.toSeq.flatten

      SearchResults(hits = hits, total = r.result.totalHits)
    }
  }

  override def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext): Future[SupplierUsageSummary] = ???

  override def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = ???

  override def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = ???

  override def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults] = ???

  override def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults] = ???

}
