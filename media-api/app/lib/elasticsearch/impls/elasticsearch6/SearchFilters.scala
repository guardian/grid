package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.auth.{Syndication, Tier}
import com.gu.mediaservice.model.QueuedForSyndication
import com.sksamuel.elastic4s.searches.queries.Query
import lib.MediaApiConfig

class SearchFilters(config: MediaApiConfig) {

  val syndicationFilter = new SyndicationFilter(config)

  def tierFilter(tier: Tier): Option[Query] = tier match {
    case Syndication => Some(syndicationFilter.statusFilter(QueuedForSyndication))
    case _ => None
  }

}