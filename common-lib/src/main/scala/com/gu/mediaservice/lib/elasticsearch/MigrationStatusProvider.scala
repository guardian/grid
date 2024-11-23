package com.gu.mediaservice.lib.elasticsearch

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.model.Instance
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
case class CompletionPreview(migrationIndexName: String) extends Running
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
  val COMPLETION_PREVIEW_ALIAS = "MIGRATION_COMPLETION_PREVIEW"
}

trait MigrationStatusProvider {
  self: ElasticSearchClient =>

  def elasticSearchConfig: ElasticSearchConfig

  def imagesCurrentAlias(instance: Instance): String = instance.id + "_" + elasticSearchConfig.aliases.current
  def imagesMigrationAlias(instance: Instance): String = instance.id + "_" + elasticSearchConfig.aliases.migration
  def imagesHistoricalAlias(instance: Instance): String = instance.id + "_" + "Images_Historical"

  def scheduler: Scheduler

  // TODO This is plain wrong; needs a backing map or something
  private def migrationStatusRef()(implicit instance: Instance) = new AtomicReference[MigrationStatus](fetchMigrationStatus(bubbleErrors = true))

  private def fetchMigrationStatus(bubbleErrors: Boolean)(implicit instance: Instance): MigrationStatus = {
    val statusFuture = getIndexForAlias(imagesMigrationAlias(instance))
      .map {
        case Some(index) if index.aliases.contains(MigrationStatusProvider.COMPLETION_PREVIEW_ALIAS) => CompletionPreview(index.name)
        case Some(index) if index.aliases.contains(MigrationStatusProvider.PAUSED_ALIAS) => Paused(index.name)
        case Some(index) => InProgress(index.name)
        case None => NotRunning
      }

    try {
      Await.result(statusFuture, atMost = 5.seconds)
    } catch {
      case e if !bubbleErrors =>
        logger.error("Failed to get name of index for ongoing migration", e)
        StatusRefreshError(cause = e, preErrorStatus = migrationStatusRef().get())
    }
  }

  private def refreshMigrationStatus()(implicit instance: Instance): Unit = {
    migrationStatusRef().set(
      fetchMigrationStatus(bubbleErrors = false)
    )
  }

  /* TODO Not compatible with instance indexes
  private val migrationStatusRefresher = scheduler.scheduleAtFixedRate(
    initialDelay = 0.seconds,
    interval = 5.seconds
  ) { () => refreshMigrationStatus(instance) }
   */

  def migrationStatus()(implicit instance: Instance): MigrationStatus = migrationStatusRef().get()
  def migrationIsInProgress()(implicit instance: Instance): Boolean = migrationStatus().isInstanceOf[InProgress]
  def refreshAndRetrieveMigrationStatus(instance: Instance): MigrationStatus = {
    implicit val i: Instance = instance
    refreshMigrationStatus()
    migrationStatus()
  }

  def migrationStatusRefresherHealth(implicit instance: Instance): Option[String] = {
    migrationStatusRef().get() match {
      case StatusRefreshError(_, _) => Some("Could not determine status of migration")
      case _ => None
    }
  }
}

case class MigrationAlreadyRunningError() extends Exception
case class MigrationNotRunningError() extends Exception
