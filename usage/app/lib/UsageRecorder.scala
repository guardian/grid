package lib


import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import rx.lang.scala.Observable

import model._


object UsageRecorder {
  val usageStream = UsageStream.observable

  val observable = usageStream.flatMap((usageGroup: UsageGroup) => {

    Observable.from(usageGroup.usages.map(mediaUsage => {
      UsageRecordTable.update(UsageRecord.fromMediaUsage(mediaUsage))
    })).flatten
  })
}
