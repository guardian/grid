package model

import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import scala.jdk.CollectionConverters._
import com.amazonaws.services.dynamodbv2.xspec.{ExpressionSpecBuilder, UpdateItemExpressionSpec}
import com.amazonaws.services.dynamodbv2.xspec.ExpressionSpecBuilder.{M, N, S}
import com.gu.mediaservice.model.usage._

import org.joda.time.DateTime
import software.amazon.awssdk.enhanced.dynamodb.Expression

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
  childUsageMetadata: Option[ChildUsageMetadata] = None,
  dateAdded: Option[DateTime] = None
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
      childUsageMetadata.map(_.toMap).map(map => M("child_metadata").set(map.asJava)),
      dateAdded.map(dateAdd => N("date_added").set(dateAdd.getMillis)),
      dateRemovedOperation match {
        case ClearDateRemoved => Some(N("date_removed").remove)
        case LeaveDateRemovedUntouched => None
        case SetDateRemoved(dateRemoved) => Some(N("date_removed").set(dateRemoved.getMillis))
      }
    ).flatten.foreach(specBuilder.addUpdate)
    specBuilder.buildForUpdate
  }

  def toAttributeValueMap(m: Map[String, Any]): java.util.Map[String, AttributeValue] =
    m.map { case (k, v) =>
      k -> toAttr(v)
    }.asJava
  def toAttr(v: Any): AttributeValue = v match {
    case s: String => AttributeValue.builder().s(s).build()
    case n: Long   => AttributeValue.builder().n(n.toString).build()
    case n: Int    => AttributeValue.builder().n(n.toString).build()
    case b: Boolean => AttributeValue.builder().bool(b).build()
    case null       => AttributeValue.builder().nul(true).build()
    case other      => throw new IllegalArgumentException(s"Unsupported type: $other")
  }
  def toExpression: Expression = {
    val setOps = scala.collection.mutable.ListBuffer.empty[(String, AttributeValue)]
    val removeOps = scala.collection.mutable.ListBuffer.empty[String]
    val names = scala.collection.mutable.Map.empty[String, String]

    def setS(field: String, value: String): Unit = {
      val name = s"#$field"
      val valueKey = s":$field"
      names += name -> field
      setOps += valueKey -> AttributeValue.builder().s(value).build()
    }

    def setN(field: String, value: Long): Unit = {
      val name = s"#$field"
      val valueKey = s":$field"
      names += name -> field
      setOps += valueKey -> AttributeValue.builder().n(value.toString).build()
    }

    def setM(field: String, value: java.util.Map[String, AttributeValue]): Unit = {
      val name = s"#$field"
      val valueKey = s":$field"
      names += name -> field
      setOps += valueKey -> AttributeValue.builder().m(value).build()
    }

    mediaId.filter(_.nonEmpty).foreach(setS("media_id", _))

    usageType.foreach(t => setS("usage_type", t.toString))

    mediaType.filter(_.nonEmpty).foreach(setS("media_type", _))

    lastModified.foreach(dt => setN("last_modified", dt.getMillis))

    usageStatus.filter(_.nonEmpty).foreach(setS("usage_status", _))

    printUsageMetadata.map(p => p.toMap).foreach(p => setM("print_metadata", toAttributeValueMap(p)))
    digitalUsageMetadata.foreach(m => setM("digital_metadata", toAttributeValueMap(m.toMap)))
    syndicationUsageMetadata.foreach(m => setM("syndication_metadata", toAttributeValueMap(m.toMap)))
    frontUsageMetadata.foreach(m => setM("front_metadata", toAttributeValueMap(m.toMap)))
    downloadUsageMetadata.foreach(m => setM("download_metadata", toAttributeValueMap(m.toMap)))
    childUsageMetadata.foreach(m => setM("child_metadata", toAttributeValueMap(m.toMap)))

    dateAdded.foreach(dt => setN("date_added", dt.getMillis))

    dateRemovedOperation match {
      case ClearDateRemoved =>
        removeOps += "date_removed"

      case LeaveDateRemovedUntouched =>
        ()

      case SetDateRemoved(dt) =>
        setN("date_removed", dt.getMillis)
    }

    val setExpr =
      if (setOps.nonEmpty)
        "SET " + setOps.map { case (v, _) => s"#${v.drop(1)} = $v" }.mkString(", ")
      else ""

    val removeExpr =
      if (removeOps.nonEmpty)
        "REMOVE " + removeOps.map(f => s"#$f").mkString(", ")
      else ""

    val expression =
      Seq(setExpr, removeExpr).filter(_.nonEmpty).mkString(" ")

    Expression.builder()
      .expression(expression)
      .expressionValues(setOps.toMap.asJava)
      .expressionNames(names.asJava)
      .build()
  }
}

object UsageRecord {
  def buildMarkAsRemovedRecord(mediaUsage: MediaUsage) = UsageRecord(
    hashKey = mediaUsage.grouping,
    rangeKey = mediaUsage.usageId.toString,
    dateRemovedOperation = SetDateRemoved(mediaUsage.lastModified)
  )

  def buildUpdateRecord(mediaUsage: MediaUsage) = UsageRecord(
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
    childUsageMetadata = mediaUsage.childUsageMetadata,
  )

  def buildCreateRecord(mediaUsage: MediaUsage) = UsageRecord(
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
    childUsageMetadata = mediaUsage.childUsageMetadata,
    dateAdded = Some(mediaUsage.lastModified),
  )
}
