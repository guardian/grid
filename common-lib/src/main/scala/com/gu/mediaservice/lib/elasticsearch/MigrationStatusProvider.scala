package com.gu.mediaservice.lib.elasticsearch

import akka.actor.Scheduler

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import scala.concurrent.ExecutionContext.Implicits.global

sealed trait MigrationStatus
object MigrationStatus {
  import scala.language.implicitConversions
  implicit def migrationStatusToOptionOfMigrationIndexName(migrationStatus: MigrationStatus): Option[String] =
    migrationStatus match {
      case StatusRefreshError(_, previousStatus) => migrationStatusToOptionOfMigrationIndexName(previousStatus)
      case InProgress(migrationIndexName) => Some(migrationIndexName)
      case _ => None
    }
}

case object NotRunning extends MigrationStatus
case class InProgress(migrationIndexName: String) extends MigrationStatus
case object Complete extends MigrationStatus
case class StatusRefreshError(cause: Throwable, preErrorStatus: MigrationStatus) extends MigrationStatus
object StatusRefreshError {
  // custom constructor to unwrap when previousStatus is also Error - prevents nested Errors!
  def apply(cause: Throwable, preErrorStatus: MigrationStatus): StatusRefreshError = {
    preErrorStatus match {
      case StatusRefreshError(_, olderStatus) => apply(cause, olderStatus)
      case status => new StatusRefreshError(cause, status)
    }
  }
}

trait MigrationStatusProvider {
  self: ElasticSearchClient =>

  def scheduler: Scheduler

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
        StatusRefreshError(cause = e, preErrorStatus = migrationStatusRef.get())
      }

    migrationStatusRef.set(
      Await.result(statusFuture, atMost = 5.seconds)
    )
  }

  private val migrationStatusRefresher = scheduler.schedule(
    initialDelay = 0.seconds,
    interval = 5.seconds
  ) { refreshMigrationStatus() }

  def migrationStatus: MigrationStatus = migrationStatusRef.get()
  def refreshAndRetrieveMigrationStatus(): MigrationStatus = {
    refreshMigrationStatus()
    migrationStatus
  }
}

case class MigrationAlreadyRunningError() extends Exception
