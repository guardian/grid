package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.elasticsearch.ImageFields
import lib.elasticsearch.{AggregateSearchParams, ElasticSearchVersion}
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext

class SuggestionController(auth: Authentication, elasticSearch: ElasticSearchVersion,
                           override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with ImageFields with AggregateResponses {

  def suggestMetadataCredit(q: Option[String], size: Option[Int]) = suggestion("suggestMetadataCredit", q, size)

  def suggestPhotoshoot(q: Option[String], size: Option[Int]) = suggestion(photoshootField("suggest"), q, size)

  private def suggestion(field: String, q: Option[String], size: Option[Int]) = auth.async { _ =>
    elasticSearch
      .completionSuggestion(field, q.getOrElse(""), size.getOrElse(10))
      .map(c => respondCollection(c.results))
  }

  // TODO: work with analysed fields
  // TODO: recover with HTTP error if invalid field
  // TODO: Add validation, especially if you use length
  def metadataSearch(field: String, q: Option[String]) = auth.async { request =>
    elasticSearch.metadataSearch(AggregateSearchParams(field, request)) map aggregateResponse
  }

  def editsSearch(field: String, q: Option[String]) = auth.async { request =>
    elasticSearch.editsSearch(AggregateSearchParams(field, request)) map aggregateResponse
  }

}
