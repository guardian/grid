package lib.elasticsearch

import akka.actor.Scheduler
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchConfig, MigrationAwareElasticSearchClient}
import com.gu.mediaservice.lib.logging.LogMarker
import lib.ThrallMetrics

sealed trait MigrationStatus

case object NotRunning extends MigrationStatus
case object InProgress extends MigrationStatus
case object Complete extends MigrationStatus
case object Error extends MigrationStatus

class MigrationClient(config: ElasticSearchConfig, metrics: Option[ThrallMetrics], val scheduler: Scheduler)
  extends MigrationAwareElasticSearchClient {

  lazy val imagesCurrentAlias: String = config.aliases.current
  lazy val imagesMigrationAlias: String = config.aliases.migration

  lazy val url: String = config.url
  lazy val cluster: String = config.cluster
  lazy val shards: Int = config.shards
  lazy val replicas: Int = config.replicas

  def getStatus():MigrationStatus = {
    val aliases = getCurrentAliases()

    val imagesIndices = aliases.getOrElse(imagesCurrentAlias, Seq())
    val migrationIndices = aliases.getOrElse(imagesMigrationAlias, Seq())
    (imagesIndices.length, migrationIndices.length) match {
      case (1,0) => NotRunning
      case (1,1) => InProgress
      case _ =>     Error
    }
  }

  def startMigration(newIndexName: String)(implicit logMarker: LogMarker): Unit = {
    val currentStatus = getStatus()
    if (currentStatus != NotRunning) {
      logger.error(logMarker, s"Could not start migration to $newIndexName when migration status is $currentStatus")
      throw new MigrationAlreadyRunningError
    }
    for {
      _ <- createImageIndex(newIndexName)
      _ = logger.info(logMarker,s"Created index $newIndexName")
      _ <- assignAliasTo(newIndexName, imagesMigrationAlias)
      _ = logger.info(logMarker, s"Assigned migration index $imagesMigrationAlias to $newIndexName")
      _ = maybeMigrationIndexName.set(Some(newIndexName))
    } yield ()
  }
}


case class MigrationAlreadyRunningError() extends Exception
