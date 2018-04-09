package model

import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder.{S, N, M}
import scalaz.syntax.id._

import com.gu.mediaservice.model.{PrintUsageMetadata, DigitalUsageMetadata}

import scala.collection.JavaConverters._

import org.joda.time.DateTime

case class UsageRecord(
  hashKey: String,
  rangeKey: String,
  mediaId: Option[String] = None,
  usageType: Option[String] = None,
  mediaType: Option[String] = None,
  lastModified: Option[DateTime] = None,
  usageStatus: Option[String] = None,
  printUsageMetadata: Option[PrintUsageMetadata] = None,
  digitalUsageMetadata: Option[DigitalUsageMetadata] = None,
  dateAdded: Option[DateTime] = None,
  // Either is used here to represent 3 possible states:
  // remove-date, add-date and no-date
  dateRemoved: Either[String, Option[DateTime]] = Right(None)
) {
  def toXSpec = {
    (new ExpressionSpecBuilder() <| (xspec => {
      List(
        mediaId.filter(_.nonEmpty).map(S("media_id").set(_)),
        usageType.filter(_.nonEmpty).map(S("usage_type").set(_)),
        mediaType.filter(_.nonEmpty).map(S("media_type").set(_)),
        lastModified.map(lastMod => N("last_modified").set(lastMod.getMillis)),
        usageStatus.filter(_.nonEmpty).map(S("usage_status").set(_)),
        printUsageMetadata.map(_.toMap).map(map => M("print_metadata").set(map.asJava)),
        digitalUsageMetadata.map(_.toMap).map(map => M("digital_metadata").set(map.asJava)),
        dateAdded.map(dateAdd => N("date_added").set(dateAdd.getMillis)),
        dateRemoved.fold(
          _ => Some(N("date_removed").remove),
          dateRem => dateRem.map(date => N("date_removed").set(date.getMillis))
        )
      ).flatten.foreach(xspec.addUpdate)
    })).buildForUpdate
  }
}

object UsageRecord {
  def buildDeleteRecord(mediaUsage: MediaUsage) = UsageRecord(
    hashKey = mediaUsage.grouping,
    rangeKey = mediaUsage.usageId.toString,
    dateRemoved = Right(Some(mediaUsage.lastModified))
  )

  def buildUpdateRecord(mediaUsage: MediaUsage) = UsageRecord(
    mediaUsage.grouping,
    mediaUsage.usageId.toString,
    Some(mediaUsage.mediaId),
    Some(mediaUsage.usageType),
    Some(mediaUsage.mediaType),
    Some(mediaUsage.lastModified),
    Some(mediaUsage.status.toString),
    mediaUsage.printUsageMetadata,
    mediaUsage.digitalUsageMetadata
  )

  def buildCreateRecord(mediaUsage: MediaUsage) = UsageRecord(
    mediaUsage.grouping,
    mediaUsage.usageId.toString,
    Some(mediaUsage.mediaId),
    Some(mediaUsage.usageType),
    Some(mediaUsage.mediaType),
    Some(mediaUsage.lastModified),
    Some(mediaUsage.status.toString),
    mediaUsage.printUsageMetadata,
    mediaUsage.digitalUsageMetadata,
    Some(mediaUsage.lastModified),
    Left("clear")
  )
}
