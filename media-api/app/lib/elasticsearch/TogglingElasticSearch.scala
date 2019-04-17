package lib.elasticsearch

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.Image
import lib.SupplierUsageSummary
import play.api.mvc.{AnyContent, Security}

import scala.concurrent.{ExecutionContext, Future}

class TogglingElasticSearch(a: ElasticSearchVersion,
                            b: ElasticSearchVersion) extends ElasticSearchVersion {

  // `a` is ES1, `b` is ES6... always use ES6
  // TODO this class is no longer needed and can be removed
  def active()(implicit request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]) = b

  override def ensureAliasAssigned(): Unit = {
    a.ensureAliasAssigned
    b.ensureAliasAssigned
  }

  override def getImageById(id: String)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]): Future[Option[Image]] = active.getImageById(id)

  override def search(params: SearchParams)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]): Future[SearchResults] = active.search(params)

  override def usageForSupplier(id: String, numDays: Int)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]):
  Future[SupplierUsageSummary] = active.usageForSupplier(id, numDays)

  override def dateHistogramAggregate(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]):
  Future[AggregateSearchResults] = active.dateHistogramAggregate(params)

  override def metadataSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]):
    Future[AggregateSearchResults] = active.metadataSearch(params)

  override def editsSearch(params: AggregateSearchParams)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]):
    Future[AggregateSearchResults] = active.editsSearch(params)

  override def completionSuggestion(name: String, q: String, size: Int)(implicit ex: ExecutionContext, request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]):
    Future[CompletionSuggestionResults] = active.completionSuggestion(name, q, size)

}
