package com.gu.mediaservice.lib.elasticsearch

import akka.actor.Scheduler
import com.gu.mediaservice.lib.logging.LogMarker

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.{Await, ExecutionContext}
import scala.concurrent.duration.DurationInt

sealed trait MigrationStatus

case object NotRunning extends MigrationStatus
case object InProgress extends MigrationStatus
case object Complete extends MigrationStatus
case object Error extends MigrationStatus

trait MigrationClient {
  self: ElasticSearchClient =>

  def imagesCurrentAlias: String
  def imagesMigrationAlias: String

  def url: String
  def cluster: String
  def shards: Int
  def replicas: Int

  def scheduler: Scheduler
  implicit def ec: ExecutionContext

  // provides namespacing of migration-related logic after being mixed into an Elasticsearch client class
  object migration {
    private val maybeMigrationIndexName = new AtomicReference[Option[String]](None)

    private val migrationIndexNameRefresher = scheduler.schedule(
      initialDelay = 0.seconds,
      interval = 1.minute
    )(
      () => {
        Await.result(getIndexForAlias(imagesMigrationAlias)
          .map(maybeName => maybeMigrationIndexName.set(maybeName.map(_.name)))
          .recover { case e =>
            // Emits log messages when requesting the name fails, then swallows exception to prevent bubbling up
            // `maybeMigrationIndexName` will remain the previous value until next scheduled execution
            logger.error("Failed to get name of index for ongoing migration", e)
            ()
          }, 5.seconds)
      }
    )

    def indexName: Option[String] = maybeMigrationIndexName.get()

    def getStatus(): MigrationStatus = {
      val aliases = getCurrentAliases()

      val imagesIndices = aliases.getOrElse(imagesCurrentAlias, Seq())
      val migrationIndices = aliases.getOrElse(imagesMigrationAlias, Seq())
      (imagesIndices.length, migrationIndices.length) match {
        case (1, 0) => NotRunning
        case (1, 1) => InProgress
        case _ => Error
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
        _ = logger.info(logMarker, s"Created index $newIndexName")
        _ <- assignAliasTo(newIndexName, imagesMigrationAlias)
        _ = logger.info(logMarker, s"Assigned migration index $imagesMigrationAlias to $newIndexName")
        _ = maybeMigrationIndexName.set(Some(newIndexName))
      } yield ()
    }
  }
}


case class MigrationAlreadyRunningError() extends Exception
