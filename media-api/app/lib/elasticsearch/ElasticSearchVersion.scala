package lib.elasticsearch

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.model.Image
import lib.SupplierUsageSummary
import play.api.mvc.AnyContent
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.{ExecutionContext, Future}

trait ElasticSearchVersion {

  def ensureAliasAssigned()

  def getImageById(id: String)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[Option[Image]]

  def search(params: SearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[SearchResults]

  def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext,request: AuthenticatedRequest[AnyContent, Principal]): Future[SupplierUsageSummary]

  def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[AggregateSearchResults]

  def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[AggregateSearchResults]

  def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[AggregateSearchResults]

  def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext, request: AuthenticatedRequest[AnyContent, Principal]): Future[CompletionSuggestionResults]

}
