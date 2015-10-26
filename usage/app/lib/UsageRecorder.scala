package lib

import play.api.Logger

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import scala.collection.JavaConversions._
import scala.collection.JavaConverters._

import play.api.libs.json._

import rx.lang.scala.{Observable, Subscriber}

import model._


object UsageRecorder {
  val usageStream = UsageStream.observable

  val rawObservable = usageStream.flatMap(recordUpdates)

  val observable = usageStream.flatMap(recordUpdates).onErrorResumeNext(e => {
    Logger.error("UsageRecorder encountered an error.", e)
    UsageMetrics.incrementErrors

    rawObservable
  })

  val subscriber = Subscriber((usage: JsObject) => {
      Logger.debug(s"UsageRecorder processed update: ${usage}")
      UsageMetrics.incrementUpdated
  })

  def subscribe = UsageRecorder.observable.subscribe(subscriber)

  def recordUpdates(usageGroup: UsageGroup) = {
    UsageTable.matchUsageGroup(usageGroup).flatMap(dbUsageGroup => {

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(UsageTable.delete(_))
      val creates = (usageGroup.usages -- dbUsageGroup.usages).map(UsageTable.create(_))
      val updates = (usageGroup.usages & dbUsageGroup.usages).map(UsageTable.update(_))

      Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
    })
  }
}
