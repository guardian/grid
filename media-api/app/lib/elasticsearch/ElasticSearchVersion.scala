package lib.elasticsearch

import lib.SupplierUsageSummary
import play.api.libs.json.JsValue

import scala.concurrent.{ExecutionContext, Future}

trait ElasticSearchVersion {

  def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[JsValue]]

  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults]

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext): Future[SupplierUsageSummary]

  def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults]

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults]

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults]

  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults]

}
