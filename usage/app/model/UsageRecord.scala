package model

import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder.{S, N, M}
import scalaz.syntax.id._

import scala.collection.JavaConversions._

import org.joda.time.DateTime


case class UsageRecord(
  hashKey: String,
  rangeKey: String,
  mediaId: Option[String] = None,
  usageType: Option[String] = None,
  mediaType: Option[String] = None,
  lastModified: Option[DateTime] = None,
  usageStatus: Option[String] = None,
  dataMap: Option[Map[String, String]] = None,
  dateAdded: Option[DateTime] = None,
  dateRemoved: Option[DateTime] = None
) {
  def toXSpec = {
    (new ExpressionSpecBuilder() <| (xspec => {
      List(
        mediaId.filter(_.nonEmpty).map(S("media_id").set(_)),
        usageType.filter(_.nonEmpty).map(S("usage_type").set(_)),
        mediaType.filter(_.nonEmpty).map(S("media_type").set(_)),
        lastModified.map(lastMod => N("last_modified").set(lastMod.getMillis)),
        usageStatus.filter(_.nonEmpty).map(S("usage_status").set(_)),
        dataMap.map(dataMap => M("data_map").set(
          dataMap.filter({ case (k,v) => k.nonEmpty && v.nonEmpty})
        )),
        dateAdded.map(dateAdd => N("date_added").set(dateAdd.getMillis)),
        dateRemoved.map(dateRem => N("date_removed").set(dateRem.getMillis))
      ).flatten.foreach(xspec.addUpdate(_))
    })).buildForUpdate
  }
}

object UsageRecord {
  def buildDeleteRecord(mediaUsage: MediaUsage) = UsageRecord(
    hashKey = mediaUsage.grouping,
    rangeKey = mediaUsage.usageId.toString,
    dateRemoved = Some(mediaUsage.lastModified)
  )

  def buildUpdateRecord(mediaUsage: MediaUsage) = UsageRecord(
    mediaUsage.grouping,
    mediaUsage.usageId.toString,
    Some(mediaUsage.mediaId),
    Some(mediaUsage.usageType),
    Some(mediaUsage.mediaType),
    Some(mediaUsage.lastModified),
    Some(mediaUsage.status.toString),
    Some(mediaUsage.data)
  )

  def buildCreateRecord(mediaUsage: MediaUsage) = UsageRecord(
    mediaUsage.grouping,
    mediaUsage.usageId.toString,
    Some(mediaUsage.mediaId),
    Some(mediaUsage.usageType),
    Some(mediaUsage.mediaType),
    Some(mediaUsage.lastModified),
    Some(mediaUsage.status.toString),
    Some(mediaUsage.data),
    Some(mediaUsage.lastModified)
  )
}
