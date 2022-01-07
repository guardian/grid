package com.gu.mediaservice.lib.elasticsearch

import akka.actor.Scheduler
import com.sksamuel.elastic4s.Index

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.Await
import scala.concurrent.duration.DurationInt
import scala.concurrent.ExecutionContext.Implicits.global

sealed trait MigrationStatus

case object NotRunning extends MigrationStatus
sealed trait Running extends MigrationStatus {
  val migrationIndexName: String
}
case class InProgress(migrationIndexName: String) extends Running
case class Paused(migrationIndexName: String) extends Running
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

object MigrationStatusProvider {
  val PAUSED_ALIAS = "MIGRATION_PAUSED"
}

trait MigrationStatusProvider {
  self: ElasticSearchClient =>

  def scheduler: Scheduler

  private val migrationStatusRef = new AtomicReference[MigrationStatus](fetchMigrationStatus(bubbleErrors = true))

  private def fetchMigrationStatus(bubbleErrors: Boolean): MigrationStatus = {
    val statusFuture = getIndexForAlias(imagesMigrationAlias)
      .map {
        case Some(index) if index.aliases.contains(MigrationStatusProvider.PAUSED_ALIAS) => Paused(index.name)
        case Some(index) => InProgress(index.name)
        case None => NotRunning
      }

    try {
      Await.result(statusFuture, atMost = 5.seconds)
    } catch {
      case e if !bubbleErrors =>
        logger.error("Failed to get name of index for ongoing migration", e)
        StatusRefreshError(cause = e, preErrorStatus = migrationStatusRef.get())
    }
  }

  private def refreshMigrationStatus(): Unit = {
    migrationStatusRef.set(
      fetchMigrationStatus(bubbleErrors = false)
    )
  }

  private val migrationStatusRefresher = scheduler.scheduleAtFixedRate(
    initialDelay = 0.seconds,
    interval = 5.seconds
  ) { () => refreshMigrationStatus() }

  def migrationStatus: MigrationStatus = migrationStatusRef.get()
  def refreshAndRetrieveMigrationStatus(): MigrationStatus = {
    refreshMigrationStatus()
    migrationStatus
  }

  def migrationStatusRefresherHealth: Option[String] = {
    migrationStatusRef.get() match {
      case StatusRefreshError(_, _) => Some("Could not determine status of migration")
      case _ => None
    }
  }
}

case class MigrationAlreadyRunningError() extends Exception
case class MigrationNotRunningError() extends Exception
