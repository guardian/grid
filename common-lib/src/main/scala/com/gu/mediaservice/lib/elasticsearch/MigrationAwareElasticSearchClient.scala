package com.gu.mediaservice.lib.elasticsearch

import akka.actor.Scheduler

import java.util.concurrent.atomic.AtomicReference
import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._


trait MigrationAwareElasticSearchClient extends ElasticSearchClient {
  def scheduler: Scheduler

  val maybeMigrationIndexName = new AtomicReference[Option[String]](None)

  private val migrationIndexNameRefresher = scheduler.schedule(
    initialDelay = 0.seconds,
    interval = 1.minute
  )(
    () => {
      Await.result(
        getIndexForAlias(imagesMigrationAlias)
          .map(maybeName => maybeMigrationIndexName.set(maybeName.map(_.name)))
          .recover { case e =>
            // Emits log messages when requesting the name fails, then swallows exception to prevent bubbling up
            // `maybeMigrationIndexName` will remain the previous value until next scheduled execution
            logger.error("Failed to get name of index for ongoing migration", e)
            ()
          }, 5.seconds
      )
    }
  )
}
