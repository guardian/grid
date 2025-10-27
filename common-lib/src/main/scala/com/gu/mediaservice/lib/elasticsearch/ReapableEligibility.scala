package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import org.joda.time.DateTime
import com.gu.mediaservice.lib.config.Provider
import scalaz.NonEmptyList

import scala.concurrent.Future

trait ReapableEligibility extends Provider{

  def initialise(): Unit = {}
  def shutdown(): Future[Unit] = Future.successful(())


  val maybePersistOnlyTheseCollections: Option[Set[String]] // typically from config
  val persistenceIdentifiers: NonEmptyList[String] // typically from config

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
    PersistedQueries.hasPersistedIdentifier(persistenceIdentifiers),
    PersistedQueries.isInPersistedCollection(maybePersistOnlyTheseCollections)
  )

  def query: Query = filters.and(
    moreThanTwentyDaysOld,
    filters.not(persistedQueries)
  )
}
