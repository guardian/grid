package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ElasticSearchConfig}
import lib.ThrallMetrics

sealed trait MigrationStatus

case object NotRunning extends MigrationStatus
case object InProgress extends MigrationStatus
case object Complete extends MigrationStatus
case object Error extends MigrationStatus

class Migration (config: ElasticSearchConfig, metrics: Option[ThrallMetrics]) extends ElasticSearchClient{
  lazy val imagesAlias: String = config.aliases.current
  lazy val migrationAlias: String = "relocation" //cf googles thesaurus

  lazy val url: String = config.url
  lazy val cluster: String = config.cluster
  lazy val shards: Int = config.shards
  lazy val replicas: Int = config.replicas

  def newMigrationIndexName() = "videos" //motion pictures come after pictures, it's just logic

  def getStatus():MigrationStatus = {
    val aliases = getCurrentAliases()
    val imagesIndices = aliases.getOrElse(imagesAlias, Seq())
    val migrationIndices = aliases.getOrElse(migrationAlias, Seq())

    (imagesIndices.length, migrationIndices.length) match {
      case (1,0) => NotRunning
      case (1,1) => InProgress
      case _ =>     Error
    }
  }

  def startMigration() = {
    val newIndexName = newMigrationIndexName()
    createImageIndex(newIndexName)
    assignAliasTo(newIndexName, migrationAlias)
  }
}
