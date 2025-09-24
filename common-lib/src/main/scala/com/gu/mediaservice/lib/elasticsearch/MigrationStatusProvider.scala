package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.instances.InstancesClient
import com.gu.mediaservice.model.Instance
import org.apache.pekko.actor.Scheduler

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.{Duration, DurationInt, SECONDS}

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

  def instancesClient: InstancesClient

  private val migrationStatues: ConcurrentHashMap[String, AtomicReference[MigrationStatus]] = new ConcurrentHashMap()

  private def migrationStatusRef(instance: Instance): AtomicReference[MigrationStatus] = {
    migrationStatues.getOrDefault(instance.id, new AtomicReference(fetchMigrationStatus(bubbleErrors = true, instance = instance)))
  }

  private def fetchMigrationStatus(bubbleErrors: Boolean, instance: Instance): MigrationStatus = {
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
        StatusRefreshError(cause = e, preErrorStatus = migrationStatusRef(instance).get)
    }
  }

  private def refreshMigrationStatus(instance: Instance): Unit = {
    migrationStatues.put(instance.id, new AtomicReference(fetchMigrationStatus(bubbleErrors = false, instance = instance)))
  }

  private val migrationStatusRefresher = scheduler.scheduleAtFixedRate(
    initialDelay = 0.seconds,
    interval = 1.minutes
  ) { () => {
    val instances = Await.result(instancesClient.getInstances(), Duration(10, SECONDS))
    instances.foreach(refreshMigrationStatus)
  }
  }

  def migrationStatus(implicit instance: Instance): MigrationStatus = migrationStatusRef(instance).get()
  def migrationIsInProgress(implicit instance: Instance): Boolean = migrationStatus.isInstanceOf[InProgress]
  def refreshAndRetrieveMigrationStatus(instance: Instance): MigrationStatus = {
    refreshMigrationStatus(instance)
    migrationStatus(instance)
  }

  def migrationStatusRefresherHealth(implicit instance: Instance): Option[String] = {
    migrationStatusRef(instance).get match {
      case StatusRefreshError(_, _) => Some("Could not determine status of migration")
      case _ => None
    }
  }
}

case class MigrationAlreadyRunningError() extends Exception
case class MigrationNotRunningError() extends Exception
