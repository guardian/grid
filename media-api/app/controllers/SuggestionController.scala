package controllers

import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.{Reads, Json, Writes}
import play.api.mvc.Controller

import com.gu.mediaservice.lib.argo.ArgoHelpers

import lib.elasticsearch.ElasticSearch
import lib.querysyntax.Parser

import scala.util.Try

object SuggestionController extends Controller with ArgoHelpers {

  val Authenticated = Authed.action

  def suggestMetadataCredit(q: Option[String], size: Option[Int]) = Authenticated.async { request =>
    ElasticSearch
      .completionSuggestion("suggestMetadataCredit", q.getOrElse(""), size.getOrElse(10))
      .map(c => respondCollection(c.results))
  }

  // TODO: work with analysed fields
  // TODO: recover with HTTP error if invalid field
  // TODO: Add validation, especially if you use length
  def metadataSearch(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.metadataSearch(AggregateSearchParams(field, request)) map ElasticSearch.aggregateResponse
  }

  def editsSearch(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.editsSearch(AggregateSearchParams(field, request)) map ElasticSearch.aggregateResponse
  }
}
