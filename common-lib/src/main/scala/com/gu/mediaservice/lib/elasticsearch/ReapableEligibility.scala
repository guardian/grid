package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import org.joda.time.DateTime

trait ReapableEligibility {

  val persistedRootCollections: List[String] // typically from config
  val persistenceIdentifier: String // typically from config

  private def moreThanTwentyDaysOld =
    filters.date("uploadTime", None, Some(DateTime.now().minusDays(20))).getOrElse(matchAllQuery())

  private lazy val persistedQueries = filters.or(
    PersistedQueries.hasCrops,
    PersistedQueries.usedInContent,
    PersistedQueries.addedToLibrary,
    PersistedQueries.hasUserEditsToImageMetadata,
    PersistedQueries.hasPhotographerUsageRights,
    PersistedQueries.hasIllustratorUsageRights,
    PersistedQueries.hasAgencyCommissionedUsageRights,
    PersistedQueries.addedToPhotoshoot,
    PersistedQueries.hasLabels,
    PersistedQueries.hasLeases,
    PersistedQueries.existedPreGrid(persistenceIdentifier),
    PersistedQueries.addedGNMArchiveOrPersistedCollections(persistedRootCollections)
  )

  def query: Query = filters.and(
    moreThanTwentyDaysOld,
    filters.not(persistedQueries)
  )
}
