package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, MigrationAlreadyRunningError, MigrationStatusProvider, NotRunning}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticApi.{existsQuery, matchQuery, not}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.SearchHit

import scala.concurrent.ExecutionContext
import scala.concurrent.duration.DurationInt


final case class ScrolledSearchResults(hits: List[SearchHit], scrollId: Option[String])

trait ThrallMigrationClient extends MigrationStatusProvider {
  self: ElasticSearchClient =>

  private val scrollKeepAlive = 30.minutes

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
}
