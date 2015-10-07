package lib


import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json._

import rx.lang.scala.Observable

import model._


object UsageRecorder {
  val usageStream = UsageStream.observable

  def recordUpdates(usageGroup: UsageGroup) = {
    UsageRecordTable.matchUsageGroup(usageGroup).map(dbUsageGroup => {

      val deletes = (dbUsageGroup.usages -- usageGroup.usages).map(mediaUsage => {
        UsageRecordTable.delete(mediaUsage.grouping, mediaUsage.usageId)
      })

      val updates = usageGroup.usages.map(UsageRecordTable.update(_))

      Observable.from(deletes ++ updates).flatten
    })
  }

  val observable = usageStream.flatMap(recordUpdates(_))
}
