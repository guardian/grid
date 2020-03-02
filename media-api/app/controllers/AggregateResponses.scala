package controllers

import lib.elasticsearch.AggregateSearchResults
import play.api.mvc.Result
import com.gu.mediaservice.lib.argo.ArgoHelpers

trait AggregateResponses extends ArgoHelpers {

  def aggregateResponse(agg: AggregateSearchResults): Result =
    respondCollection(agg.results, Some(0), Some(agg.total))

}
