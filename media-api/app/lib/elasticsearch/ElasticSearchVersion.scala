package lib.elasticsearch

import com.gu.mediaservice.model.Image
import lib.SupplierUsageSummary

import scala.concurrent.{ExecutionContext, Future}

trait ElasticSearchVersion {

  def ensureAliasAssigned()

  def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[Image]]

  def search(params: SearchParams)(implicit ex: ExecutionContext): Future[SearchResults]

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext): Future[SupplierUsageSummary]

  def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults]

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults]

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext): Future[AggregateSearchResults]

  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext): Future[CompletionSuggestionResults]

}
