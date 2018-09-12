package com.gu.mediaservice.lib

import _root_.play.api.libs.json._
import akka.actor.Scheduler
import com.gu.Box
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.config.CommonConfig
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

abstract class DynamoStore[TStoreKey, TStoreVal](tableName: String, config: CommonConfig)(implicit ec: ExecutionContext) {
  val dynamo = new DynamoDB(config, tableName)

  protected val store: Box[Map[TStoreKey, TStoreVal]] = Box(Map.empty)
  protected val lastUpdated: Box[DateTime] = Box(DateTime.now())

  protected def scanDynamoTable: List[JsValue] =
    Option(dynamo.table.scan().iterator.asScala.toList.map(item => Json.parse(item.toJSON))).getOrElse(List.empty)

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update(): Unit
}

