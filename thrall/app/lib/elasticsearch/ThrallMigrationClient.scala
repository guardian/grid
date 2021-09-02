package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, MigrationAlreadyRunningError, MigrationStatusProvider, NotRunning}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticApi.{existsQuery, matchQuery, not}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._

import scala.concurrent.ExecutionContext

trait ThrallMigrationClient extends MigrationStatusProvider {
  self: ElasticSearchClient =>

  def getNextBatchOfImageIdsToMigrate(migrationIndexName: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    // TODO create constant for field name "esInfo.migration.migratedTo"
    val search = ElasticDsl.search(imagesCurrentAlias) query not(
      matchQuery("esInfo.migration.migratedTo", migrationIndexName),
      existsQuery(s"esInfo.migration.failures.$migrationIndexName")
    )
    executeAndLog(search, "retrieving next batch of image ids to migrate").map { response =>
      response.result.hits.hits
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
