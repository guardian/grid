package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, MigrationAlreadyRunningError, MigrationStatusProvider, NotRunning}
import com.gu.mediaservice.lib.logging.LogMarker

trait ThrallMigrationClient extends MigrationStatusProvider {
  self: ElasticSearchClient =>

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
