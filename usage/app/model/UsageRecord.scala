package model

import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder.{S, N, M}

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
  dataMap: Option[Map[String, Object]] = None,
  dateAdded: Option[DateTime] = None
) {

  def toXSpec = {
    val xspec = new ExpressionSpecBuilder()

    List(
      mediaId.map(S("media_id").set(_)),
      usageType.map(S("usage_type").set(_)),
      mediaType.map(S("media_type").set(_)),
      lastModified.map(lastMod => N("last_modified").set(lastMod.getMillis)),
      usageStatus.map(S("usage_status").set(_)),
      dataMap.map(dataMap => M("data_map").set(dataMap)),
      dateAdded.map(dateAdd => N("date_added").set(dateAdd.getMillis))
    ).flatten.foreach(xspec.addUpdate(_))

    xspec.buildForUpdate
  }
}

object UsageRecord {
  def buildUpdateRecord(mediaUsage: MediaUsage) = UsageRecord(
    mediaUsage.grouping,
    mediaUsage.usageId,
    Some(mediaUsage.mediaId),
    Some(mediaUsage.usageType),
    Some(mediaUsage.mediaType),
    Some(mediaUsage.lastModified),
    Some(mediaUsage.status.toString),
    Some(mediaUsage.data)
  )

  def buildCreateRecord(mediaUsage: MediaUsage) = UsageRecord(
    mediaUsage.grouping,
    mediaUsage.usageId,
    Some(mediaUsage.mediaId),
    Some(mediaUsage.usageType),
    Some(mediaUsage.mediaType),
    Some(mediaUsage.lastModified),
    Some(mediaUsage.status.toString),
    Some(mediaUsage.data),
    Some(mediaUsage.lastModified)
  )
}
