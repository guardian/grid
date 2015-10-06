package lib


import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import rx.lang.scala.Observable

import model._


object UsageRecorder {
  val usageStream = UsageStream.observable

  def recordUpdates(usageGroup: UsageGroup) = {
    UsageRecordTable.getUsageGroup(usageGroup.grouping).map(dbUsageGroup => {
      println(dbUsageGroup)

      println("------------------------------------------")
      usageGroup.usages.map(UsageRecordTable.update(_))
    })
  }

  val observable = usageStream.flatMap(recordUpdates(_))
}
