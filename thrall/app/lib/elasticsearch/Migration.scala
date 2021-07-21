package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ElasticSearchConfig}
import com.gu.mediaservice.lib.logging.LogMarker
import lib.ThrallMetrics

sealed trait MigrationStatus

case object NotRunning extends MigrationStatus
case object InProgress extends MigrationStatus
case object Complete extends MigrationStatus
case object Error extends MigrationStatus

class Migration (config: ElasticSearchConfig, metrics: Option[ThrallMetrics]) extends ElasticSearchClient{
  lazy val imagesCurrentAlias: String = config.aliases.current
  lazy val imagesMigrationAlias: String = "relocation" //cf googles thesaurus

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

  def startMigration(newIndexName: String)(implicit logMarker: LogMarker) = {
    createImageIndex(newIndexName)
    logger.info(logMarker,s"Created index ${newIndexName}")
    assignAliasTo(newIndexName, imagesMigrationAlias)
    logger.info(logMarker, s"Assigned migration index ${imagesMigrationAlias} to ${newIndexName}")
  }
}
