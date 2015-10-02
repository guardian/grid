package lib


import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import rx.lang.scala.Observable

import model._


object UsageRecorder {
  val usageStream = UsageStream.observable

  def recordUpdates(usageGroup: UsageGroup) =
    UsageRecord.fromUsageGroup(usageGroup).map(UsageRecordTable.update(_))

  val observable = usageStream.flatMap(usageGroup =>
    Observable.from(recordUpdates(usageGroup)).flatten)
}
