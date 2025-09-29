package controllers

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.lib.play.RequestLoggingFilter
import lib.elasticsearch.{AggregateSearchParams, ElasticSearch}
import play.api.mvc._

import scala.concurrent.ExecutionContext

class AggregationController(auth: Authentication, elasticSearch: ElasticSearch,
                            override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with AggregateResponses {

  def dateHistogram(field: String, q: Option[String]) = auth.async { request =>
    implicit val logMarker: LogMarker = MarkerMap(
      "requestType" -> "date-histogram",
      "requestId" -> RequestLoggingFilter.getRequestId(request),
      "fieldName" -> field,
    ) ++ RequestLoggingFilter.loggablePrincipal(request.user)

    elasticSearch.dateHistogramAggregate(AggregateSearchParams(field, request))
      .map(aggregateResponse)
  }

}
