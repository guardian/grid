package lib.elasticsearch

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.model.Image
import lib.SupplierUsageSummary
import play.api.Logger
import play.api.mvc.{AnyContent, Security}

import scala.concurrent.{ExecutionContext, Future}

class TogglingElasticSearch(stableIndex: ElasticSearchVersion,
                            fallbackIndex: Option[ElasticSearchVersion]) extends ElasticSearchVersion {

  val OPT_OUT_COOKIE_NAME = "GRID_ELASTIC6_OPT_OUT"

  def active()(implicit request: Security.AuthenticatedRequest[AnyContent, Authentication.Principal]) = {
    val userIdentifier = request.user.apiKey.name
    val userHasRequestedOptOut = request.cookies.exists(c => c.name == OPT_OUT_COOKIE_NAME)
    if (userHasRequestedOptOut) {
      Logger.info("User " + userIdentifier + " is still opted out of Elastic 6 indexes; using fallback index if still configured")
      fallbackIndex.getOrElse(stableIndex)
    } else stableIndex
  }

  override def ensureAliasAssigned(): Unit = {
    val availableIndexes = Seq(Some(stableIndex), fallbackIndex).flatten
    availableIndexes.map(_.ensureAliasAssigned())
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
