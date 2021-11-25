package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, InProgress, MigrationAlreadyRunningError, MigrationStatusProvider, NotRunning, Paused}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticApi.{existsQuery, matchQuery, not}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.SearchHit
import com.sksamuel.elastic4s.requests.searches.aggs.responses.bucket.Terms
import com.sksamuel.elastic4s.requests.searches.aggs.responses.metrics.TopHits
import lib.{FailedMigrationDetails, FailedMigrationSummary, FailedMigrationsGrouping, FailedMigrationsOverview}
import play.api.libs.json.{JsError, JsSuccess, Json, Reads, __}

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt


final case class ScrolledSearchResults(hits: List[SearchHit], scrollId: Option[String])
final case class EsInfoContainer(esInfo: EsInfo)

trait ThrallMigrationClient extends MigrationStatusProvider {
  self: ElasticSearchClient =>

  private val scrollKeepAlive = 5.minutes

  def startScrollingImageIdsToMigrate(migrationIndexName: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    // TODO create constant for field name "esInfo.migration.migratedTo"
    val query = search(imagesCurrentAlias).version(true).scroll(scrollKeepAlive).size(100) query not(
      matchQuery("esInfo.migration.migratedTo", migrationIndexName),
      existsQuery(s"esInfo.migration.failures.$migrationIndexName")
    )
    executeAndLog(query, "retrieving next batch of image ids to migrate").map { response =>
      ScrolledSearchResults(response.result.hits.hits.toList, response.result.scrollId)
    }
  }
  def continueScrollingImageIdsToMigrate(scrollId: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    val query = searchScroll(scrollId).keepAlive(scrollKeepAlive)
    executeAndLog(query, "retrieving next batch of image ids to migrate, continuation of scroll").map { response =>
      ScrolledSearchResults(response.result.hits.hits.toList, response.result.scrollId)
    }
  }
  def closeScroll(scrollId: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    val close = clearScroll(scrollId)
    executeAndLog(close, s"Closing unwanted scroll").failed.foreach { e =>
      logger.error(logMarker, "ES closeScroll request failed", e)
    }
  }

  def pauseMigration: Unit = {
    val currentStatus = refreshAndRetrieveMigrationStatus()
    currentStatus match {
      case InProgress(migrationIndexName) =>
        assignAliasTo(migrationIndexName, MigrationStatusProvider.PAUSED_ALIAS)
      case _ =>
        logger.error(s"Could not pause migration when migration status is $currentStatus")
        throw new MigrationAlreadyRunningError
    }
  }

  def resumeMigration: Unit = {
    val currentStatus = refreshAndRetrieveMigrationStatus()
    currentStatus match {
      case Paused(migrationIndexName) =>
        removeAliasFrom(migrationIndexName, MigrationStatusProvider.PAUSED_ALIAS)
      case _ =>
        logger.error( s"Could not resume migration when migration status is $currentStatus")
        throw new MigrationAlreadyRunningError
    }
  }

  def startMigration(newIndexName: String)(implicit logMarker: LogMarker): Unit = {
    val currentStatus = refreshAndRetrieveMigrationStatus()
    if (currentStatus != NotRunning) {
      logger.error(logMarker, s"Could not start migration to $newIndexName when migration status is $currentStatus")
      throw new MigrationAlreadyRunningError
    }
    for {
      _ <- createImageIndex(newIndexName)
      _ = logger.info(logMarker, s"Created index $newIndexName")
      _ <- assignAliasTo(newIndexName, imagesMigrationAlias)
      _ = logger.info(logMarker, s"Assigned migration index $imagesMigrationAlias to $newIndexName")
      _ = refreshAndRetrieveMigrationStatus()
    } yield ()
  }

  def getMigrationFailuresOverview(
    currentIndexName: String, migrationIndexName: String
  )(implicit ec: ExecutionContext, logMarker: LogMarker = MarkerMap()): Future[FailedMigrationsOverview] = {

    val examplesSubAggregation = topHitsAgg("examples")
      .fetchSource(false)
      .size(3)

    val aggregateOnFailureMessage =
      termsAgg("failures", s"esInfo.migration.failures.$migrationIndexName.keyword")
        .size(1000)
        .subAggregations(examplesSubAggregation)

    val aggSearch = ElasticDsl.search(currentIndexName).trackTotalHits(true) query must(
      existsQuery(s"esInfo.migration.failures.$migrationIndexName"),
      not(matchQuery("esInfo.migration.migratedTo", migrationIndexName))
    ) aggregations aggregateOnFailureMessage

    executeAndLog(aggSearch, s"retrieving grouped overview of migration failures").map { response =>
      FailedMigrationsOverview(
        totalFailed = response.result.hits.total.value,
        grouped = response.result.aggregations.result[Terms](aggregateOnFailureMessage.name).buckets.map { bucket  =>
          FailedMigrationsGrouping(
            message = bucket.key,
            count = bucket.docCount,
            exampleIDs = bucket.result[TopHits](examplesSubAggregation.name).hits.map(_.id)
          )
        }
      )
    }
  }

  def getMigrationFailures(
    currentIndexName: String, migrationIndexName: String, from: Int, pageSize: Int, filter: String
  )(implicit ec: ExecutionContext, logMarker: LogMarker = MarkerMap()): Future[FailedMigrationSummary] = {
    val search = ElasticDsl.search(currentIndexName).trackTotalHits(true).from(from).size(pageSize) query must(
      existsQuery(s"esInfo.migration.failures.$migrationIndexName"),
      termQuery(s"esInfo.migration.failures.$migrationIndexName.keyword", filter),
      not(matchQuery("esInfo.migration.migratedTo", migrationIndexName))
    )
    executeAndLog(search, s"retrieving list of migration failures")
      .map { resp =>
        val failedMigrationDetails: Seq[FailedMigrationDetails] = resp.result.hits.hits.map { hit =>
            FailedMigrationDetails(imageId = hit.id)
        }

        FailedMigrationSummary(
          totalFailed = resp.result.hits.total.value,
          details = failedMigrationDetails
        )
      }
  }
}
