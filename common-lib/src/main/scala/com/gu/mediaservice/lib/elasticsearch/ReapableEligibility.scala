package com.gu.mediaservice.lib.elasticsearch

import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import org.joda.time.DateTime
import com.gu.mediaservice.lib.config. Provider
import scala.concurrent.Future

trait ReapableEligibility extends Provider{

  def initialise(): Unit = {}
  def shutdown(): Future[Unit] = Future.successful(())


  val maybePersistOnlyTheseCollections: Option[Set[String]] // typically from config

  private def moreThanTwentyDaysOld =
    filters.date("uploadTime", None, Some(DateTime.now().minusDays(ReapableEligibility.ReapableAfterMoreThanDaysOld))).getOrElse(matchAllQuery())

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
    PersistedQueries.isInPersistedCollection(maybePersistOnlyTheseCollections)
  )

  private def isFeedUpload =
    filters.boolTerm("source.isFeedUpload", value = true)

  def query: Query = filters.and(
    moreThanTwentyDaysOld,
    isFeedUpload,
    filters.not(persistedQueries)
  )

  def preview: Query = filters.and(
    isFeedUpload,
    filters.not(persistedQueries)
  )

}

object ReapableEligibility {
  val ReapableAfterMoreThanDaysOld: Int = 20
}
