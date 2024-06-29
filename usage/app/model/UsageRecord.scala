package model

import com.amazonaws.services.dynamodbv2.xspec.{ExpressionSpecBuilder, UpdateItemExpressionSpec}
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder.{M, N, S}
import com.gu.mediaservice.model.Instance
import com.gu.mediaservice.model.usage._

import scala.jdk.CollectionConverters._
import org.joda.time.DateTime

sealed trait DateRemovedOperation
case object ClearDateRemoved extends DateRemovedOperation
case object LeaveDateRemovedUntouched extends DateRemovedOperation
case class SetDateRemoved(dateRemoved: DateTime) extends DateRemovedOperation

case class UsageRecord(
  hashKey: String,
  rangeKey: String,
  dateRemovedOperation: DateRemovedOperation,
  mediaId: Option[String] = None,
  usageType: Option[UsageType] = None,
  mediaType: Option[String] = None,
  lastModified: Option[DateTime] = None,
  usageStatus: Option[String] = None,
  printUsageMetadata: Option[PrintUsageMetadata] = None,
  digitalUsageMetadata: Option[DigitalUsageMetadata] = None,
  syndicationUsageMetadata: Option[SyndicationUsageMetadata] = None,
  frontUsageMetadata: Option[FrontUsageMetadata] = None,
  downloadUsageMetadata: Option[DownloadUsageMetadata] = None,
  dateAdded: Option[DateTime] = None,
  instance: String
) {
  def toXSpec: UpdateItemExpressionSpec = {
    val specBuilder = new ExpressionSpecBuilder
    List(
      mediaId.filter(_.nonEmpty).map(S("media_id").set(_)),
      usageType.map(usageType => S("usage_type").set(usageType.toString)),
      mediaType.filter(_.nonEmpty).map(S("media_type").set(_)),
      lastModified.map(lastMod => N("last_modified").set(lastMod.getMillis)),
      usageStatus.filter(_.nonEmpty).map(S("usage_status").set(_)),
      printUsageMetadata.map(_.toMap).map(map => M("print_metadata").set(map.asJava)),
      digitalUsageMetadata.map(_.toMap).map(map => M("digital_metadata").set(map.asJava)),
      syndicationUsageMetadata.map(_.toMap).map(map => M("syndication_metadata").set(map.asJava)),
      frontUsageMetadata.map(_.toMap).map(map => M("front_metadata").set(map.asJava)),
      downloadUsageMetadata.map(_.toMap).map(map => M("download_metadata").set(map.asJava)),
      dateAdded.map(dateAdd => N("date_added").set(dateAdd.getMillis)),
      dateRemovedOperation match {
        case ClearDateRemoved => Some(N("date_removed").remove)
        case LeaveDateRemovedUntouched => None
        case SetDateRemoved(dateRemoved) => Some(N("date_removed").set(dateRemoved.getMillis))
      },
      Some(S("instance").set(instance))
    ).flatten.foreach(specBuilder.addUpdate)
    specBuilder.buildForUpdate
  }
}

object UsageRecord {
  def buildMarkAsRemovedRecord(mediaUsage: MediaUsage)(implicit instance: Instance) = UsageRecord(
    hashKey = mediaUsage.grouping,
    rangeKey = mediaUsage.usageId.toString,
    dateRemovedOperation = SetDateRemoved(mediaUsage.lastModified),
    instance = instance.id
  )

  def buildUpdateRecord(mediaUsage: MediaUsage)(implicit instance: Instance) = UsageRecord(
    hashKey = mediaUsage.grouping,
    rangeKey = mediaUsage.usageId.toString,
    dateRemovedOperation = LeaveDateRemovedUntouched,
    mediaId = Some(mediaUsage.mediaId),
    usageType = Some(mediaUsage.usageType),
    mediaType = Some(mediaUsage.mediaType),
    lastModified = Some(mediaUsage.lastModified),
    usageStatus = Some(mediaUsage.status.toString),
    printUsageMetadata = mediaUsage.printUsageMetadata,
    digitalUsageMetadata = mediaUsage.digitalUsageMetadata,
    syndicationUsageMetadata = mediaUsage.syndicationUsageMetadata,
    frontUsageMetadata = mediaUsage.frontUsageMetadata,
    downloadUsageMetadata = mediaUsage.downloadUsageMetadata,
    instance = instance.id
  )

  def buildCreateRecord(mediaUsage: MediaUsage)(implicit instance: Instance) = UsageRecord(
    hashKey = mediaUsage.grouping,
    rangeKey = mediaUsage.usageId.toString,
    dateRemovedOperation = ClearDateRemoved,
    mediaId = Some(mediaUsage.mediaId),
    usageType = Some(mediaUsage.usageType),
    mediaType = Some(mediaUsage.mediaType),
    lastModified = Some(mediaUsage.lastModified),
    usageStatus = Some(mediaUsage.status.toString),
    printUsageMetadata = mediaUsage.printUsageMetadata,
    digitalUsageMetadata = mediaUsage.digitalUsageMetadata,
    syndicationUsageMetadata = mediaUsage.syndicationUsageMetadata,
    frontUsageMetadata = mediaUsage.frontUsageMetadata,
    downloadUsageMetadata = mediaUsage.downloadUsageMetadata,
    dateAdded = Some(mediaUsage.lastModified),
    instance = instance.id
  )
}
