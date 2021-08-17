package com.gu.mediaservice.lib.elasticsearch

import akka.actor.Scheduler

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.duration.DurationInt
import scala.concurrent.{Await, ExecutionContext}

sealed trait MigrationStatus
object MigrationStatus {
  import scala.language.implicitConversions
  implicit def migrationStatusToOptionOfMigrationIndexName(migrationStatus: MigrationStatus): Option[String] =
    migrationStatus match {
      case InProgress(migrationIndexName) => Some(migrationIndexName)
      case _ => None
    }
}

case object NotRunning extends MigrationStatus
case class InProgress(migrationIndexName: String) extends MigrationStatus
case object Complete extends MigrationStatus
case object Error extends MigrationStatus

trait MigrationClient {
  self: ElasticSearchClient =>

  def scheduler: Scheduler
  implicit def ec: ExecutionContext

  // provides namespacing of migration-related logic after being mixed into an Elasticsearch client class
  object migration {
    private val migrationStatusRef = new AtomicReference[MigrationStatus](NotRunning)

    private def refreshMigrationStatus(): Unit = {
      val statusFuture = getIndexForAlias(imagesMigrationAlias)
        .map {
          case Some(index) => InProgress(index.name)
          case None => NotRunning
        }
        .recover { case e =>
          // Emits log messages when requesting the name fails, then swallows exception to prevent bubbling up
          // `migrationStatusRef` will remain the previous value until next scheduled execution
          logger.error("Failed to get name of index for ongoing migration", e)
          Error
        }

      migrationStatusRef.set(
        Await.result(statusFuture, atMost = 5.seconds)
      )
    }

    private val migrationStatusRefresher = scheduler.schedule(
      initialDelay = 0.seconds,
      interval = 1.minute
    ) { refreshMigrationStatus() }

    def migrationStatus: MigrationStatus = migrationStatusRef.get()
    def refreshAndRetrieveStatus(): MigrationStatus = {
      refreshMigrationStatus()
      migrationStatus
    }
  }
}


case class MigrationAlreadyRunningError() extends Exception
