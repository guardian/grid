package controllers

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.model.Instance
import lib.elasticsearch.{AggregateSearchParams, ElasticSearch}
import play.api.mvc._

import scala.concurrent.ExecutionContext

class AggregationController(auth: Authentication, elasticSearch: ElasticSearch,
                            override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with AggregateResponses with InstanceForRequest {

  def dateHistogram(field: String, q: Option[String]) = auth.async { request =>
    implicit val instance: Instance = instanceOf(request)

    elasticSearch.dateHistogramAggregate(AggregateSearchParams(field, request))
      .map(aggregateResponse)
  }

}
