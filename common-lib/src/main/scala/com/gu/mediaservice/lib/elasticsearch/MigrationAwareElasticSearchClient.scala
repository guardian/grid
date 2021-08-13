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
      // TODO what happens if this times out/fails?
      maybeMigrationIndexName.set(Await.result(getIndexForAlias(imagesMigrationAlias), 5.seconds).map(_.name))
    }
  )
}
