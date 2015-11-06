package controllers

import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.{Reads, Json, Writes}
import play.api.mvc.{AnyContent, Request, Controller}

import com.gu.mediaservice.lib.argo.ArgoHelpers

import lib.elasticsearch.{AggregateSearchResults, ElasticSearch}
import lib.querysyntax.Parser

import scala.util.Try

object SuggestionController extends Controller with ArgoHelpers {

  val Authenticated = Authed.action

  def suggestMetadataCredit(q: Option[String], size: Option[Int]) = Authenticated.async { request =>
    ElasticSearch
      .completionSuggestion("suggestMetadataCredit", q.getOrElse(""), size.getOrElse(10))
      .map(c => respondCollection(c.results))
  }

  def suggestLabels(q: Option[String]) = Authenticated {

    val pseudoFamousLabels = List(
      "cities", "family", "filmandmusic", "lr", "pp", "saturdayreview", "trv",

      "culturearts", "culturebooks", "culturefilm", "culturestage", "culturemusic",

      "g2arts", "g2columns", "g2coverfeatures", "g2fashion", "g2features", "g2food", "g2health",
      "g2lifestyle", "g2shortcuts", "g2tv", "g2women",

      "obsbizcash", "obscomment", "obsfocus", "obsfoodfeat", "obsfoodother", "obsfoodrecipes",
      "obsfoodsupp", "obsforeign", "obshome", "obsmagfash", "obsmagfeat", "obsmaglife",
      "obsrevagenda", "obsrevbooks", "obsrevcritics", "obsrevdiscover", "obsrevfeat",
      "obsrevmusic", "obsrevtv", "obssports", "obssupps", "obstechbright", "obstechfeat",
      "obstechplay"
    )

    val labels = q.map { q =>
      pseudoFamousLabels.filter(_.startsWith(q))
    }.getOrElse(pseudoFamousLabels)

    respondCollection(labels)
  }

  def suggestLabelSiblings(label: String, q: Option[String], selectedLabels: Option[String]) = Authenticated.async { request =>
    val selectedLabels_ = selectedLabels.map(_.split(",").toList.map(_.trim)).getOrElse(Nil)
    val structuredQuery = q.map(Parser.run) getOrElse List()

    ElasticSearch.labelSiblingsSearch(structuredQuery, excludeLabels = List(label)) map { agg =>
      val labels = agg.results.map { label =>
        val selected = selectedLabels_.contains(label.key)
        LabelSibling(label.key, selected)
      }
      respond(LabelSiblingsResponse(label, labels.toList))
    }
  }

  // TODO: work with analysed fields
  // TODO: recover with HTTP error if invalid field
  // TODO: Add validation, especially if you use length
  def metadataSearch(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.metadataSearch(AggregateSearchParams(field, q)) map aggregateResponse
  }

  def editsSearch(field: String, q: Option[String]) = Authenticated.async { request =>
    ElasticSearch.editsSearch(AggregateSearchParams(field, q)) map aggregateResponse
  }

  // TODO: Add some useful links
  def aggregateResponse(agg: AggregateSearchResults) =
    respondCollection(agg.results, Some(0), Some(agg.total))

}

case class LabelSibling(name: String, selected: Boolean)
object LabelSibling {
  implicit def jsonWrites: Writes[LabelSibling] = Json.writes[LabelSibling]
  implicit def jsonReads: Reads[LabelSibling] =  Json.reads[LabelSibling]
}

case class LabelSiblingsResponse(label: String, siblings: List[LabelSibling])
object LabelSiblingsResponse {
  implicit def jsonWrites: Writes[LabelSiblingsResponse] = Json.writes[LabelSiblingsResponse]
  implicit def jsonReads: Reads[LabelSiblingsResponse] =  Json.reads[LabelSiblingsResponse]
}

case class AggregateSearchParams(field: String, q: Option[String])
object AggregateSearchParams {
  def parseIntFromQuery(s: String): Option[Int] = Try(s.toInt).toOption

  def apply(field: String, request: Request[AnyContent]): AggregateSearchParams = {
    AggregateSearchParams(
      field,
      request.getQueryString("q")
    )
  }
}
