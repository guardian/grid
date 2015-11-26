package lib

import play.api.Logger

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration._

import scala.collection.JavaConversions._
import scala.collection.JavaConverters._

import play.api.libs.json._

import rx.lang.scala.{Observable, Subscriber}

import model._

case class ResetException() extends Exception

object UsageRecorder {
  val usageStream = UsageStream.observable
  val resetInterval = 30.seconds

  // Due to a difficult to track down memory leak we 'reset' (unsubscribe/resubscribe)
  // This seems to make references in upstream observables available for GC
  val resetStreamObservable = Observable.interval(resetInterval).flatMap(_ => {
    Observable.error(new ResetException())
  })

  val rawObservable = usageStream.merge(resetStreamObservable).flatMap(recordUpdates)

  val observable = rawObservable.retry((_, error) => {
    error match {
      case _:ResetException => // Do nothing
      case _ => {
        Logger.error("UsageRecorder encountered an error.", error)
        UsageMetrics.incrementErrors
      }
    }

    true
  })

  val subscriber = Subscriber((usage: JsObject) => {
      Logger.debug(s"UsageRecorder processed update: $usage")
      UsageMetrics.incrementUpdated
  })

  def subscribe = UsageRecorder.observable.subscribe(subscriber)

  def recordUpdates(usageGroup: UsageGroup) = {
    UsageTable.matchUsageGroup(usageGroup).flatMap(dbUsageGroup => {

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(UsageTable.delete)
      val creates = (usageGroup.usages -- dbUsageGroup.usages).map(UsageTable.create)
      val updates = (usageGroup.usages & dbUsageGroup.usages).map(UsageTable.update)

      Observable.from(deletes ++ updates ++ creates).flatten[JsObject]
    })
  }
}
