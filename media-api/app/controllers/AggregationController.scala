package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import lib.elasticsearch.ElasticSearch
import lib.querysyntax.{Condition, Parser}
import play.api.mvc._

import scala.concurrent.ExecutionContext
import scala.util.Try

class AggregationController(auth: Authentication, elasticSearch: ElasticSearch,
                            override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers {

  def dateHistogram(field: String, q: Option[String]) = auth.async { request =>
    elasticSearch.dateHistogramAggregate(AggregateSearchParams(field, request))
      .map(elasticSearch.aggregateResponse)
  }

}

case class AggregateSearchParams(field: String,
                                 q: Option[String],
                                 structuredQuery: List[Condition])

object AggregateSearchParams {
  def parseIntFromQuery(s: String): Option[Int] = Try(s.toInt).toOption

  def apply(field: String, request: Request[AnyContent]): AggregateSearchParams = {
    val query = request.getQueryString("q")
    val structuredQuery = query.map(Parser.run) getOrElse List[Condition]()
    new AggregateSearchParams(
      field,
      query,
      structuredQuery
    )
  }
}
