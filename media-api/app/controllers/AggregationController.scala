package controllers

import play.api.libs.concurrent.Execution.Implicits._
import lib.elasticsearch.ElasticSearch
import lib.querysyntax.{Parser, Condition}
import play.api.mvc.{AnyContent, Request, Controller}

import scala.util.Try

/**
  * Created by npapacostas on 01/03/2016.
  */
object AggregationController extends Controller {
  val Authenticated = Authed.action

  def dateHistogram(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.dateHistogramAggregate(AggregateSearchParams(field, request))
      .map(ElasticSearch.aggregateResponse(_))
  }

}

case class AggregateSearchParams(
                                  field: String,
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
