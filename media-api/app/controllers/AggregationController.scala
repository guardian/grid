package controllers

import com.gu.mediaservice.lib.auth.Authentication
import lib.elasticsearch.{AggregateSearchParams, ElasticSearch}
import play.api.mvc._

import scala.concurrent.ExecutionContext

class AggregationController(auth: Authentication, elasticSearch: ElasticSearch,
                            override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with AggregateResponses {

  def dateHistogram(field: String, q: Option[String]) = auth.async { request =>
    implicit val r: Authentication.Request[AnyContent] = request

    elasticSearch.dateHistogramAggregate(AggregateSearchParams(field, request))
      .map(aggregateResponse)
  }

  def metadataFieldValues(field: String, q: Option[String], size: Option[Int]) = auth.async { request =>
    implicit val r: Authentication.Request[AnyContent] = request

    val baseParams = AggregateSearchParams(field, request)
    val params = baseParams.copy(size = size.getOrElse(10))
    elasticSearch.metadataSearch(params)
      .map(aggregateResponse)
  }

}
