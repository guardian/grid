package com.gu.mediaservice.lib.usage

import java.net.URI
import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import software.amazon.awssdk.enhanced.dynamodb.EnhancedType
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.services.dynamodb.model.AttributeValue

import scala.jdk.CollectionConverters._
import scala.util.Try

object ItemToMediaUsage {

  def transform(item: Item): MediaUsage = {
    MediaUsage(
      UsageId(item.getString("usage_id")),
      item.getString("grouping"),
      item.getString("media_id"),
      UsageType(item.getString("usage_type")),
      item.getString("media_type"),
      UsageStatus(item.getString("usage_status")),
      Option(item.getMap[Any]("print_metadata"))
        .map(_.asScala.toMap).flatMap(buildPrint),
      Option(item.getMap[Any]("digital_metadata"))
        .map(_.asScala.toMap).flatMap(buildDigital),
      Option(item.getMap[Any]("syndication_metadata"))
        .map(_.asScala.toMap).flatMap(buildSyndication),
      Option(item.getMap[Any]("front_metadata"))
        .map(_.asScala.toMap).flatMap(buildFront),
      Option(item.getMap[String]("download_metadata"))
        .map(_.asScala.toMap).flatMap(buildDownload),
      Option(item.getMap[String]("child_metadata"))
        .map(_.asScala.toMap).flatMap(buildChild),
      new DateTime(item.getLong("last_modified")),
      Try {
        item.getLong("date_added")
      }.toOption.map(new DateTime(_)),
      Try {
        item.getLong("date_removed")
      }.toOption.map(new DateTime(_))
    )
  }
  def transform(doc: EnhancedDocument): MediaUsage = {
    MediaUsage(
      UsageId(doc.getString("usage_id")),
      doc.getString("grouping"),
      doc.getString("media_id"),
      UsageType(doc.getString("usage_type")),
      doc.getString("media_type"),
      UsageStatus(doc.getString("usage_status")),
      Option(doc.getMap(
          "print_metadata",
          EnhancedType.of(classOf[String]),
          EnhancedType.of(classOf[AttributeValue])
        ))
        .map(_.asScala.toMap)
        .flatMap(buildPrintFromAttr),
      Option(doc.getMapOfUnknownType("digital_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildDigital),
      Option(doc.getMapOfUnknownType("syndication_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildSyndication),
      Option(doc.getMapOfUnknownType("front_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildFront),
      Option(doc.getMap("download_metadata", EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String])))
        .map(_.asScala.toMap)
        .flatMap(buildDownload),
      Option(doc.getMap("child_metadata", EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String])))
        .map(_.asScala.toMap)
        .flatMap(buildChild),
      new DateTime(doc.getNumber("last_modified").longValue()),
      Try(doc.getNumber("date_added").longValue()).toOption.map(new DateTime(_)),
      Try(doc.getNumber("date_removed").longValue()).toOption.map(new DateTime(_))
    )
  }


  private def buildFront(metadataMap: Map[String, Any]): Option[FrontUsageMetadata] = {
    Try {
      FrontUsageMetadata(
        metadataMap("addedBy").asInstanceOf[String],
        metadataMap("front").asInstanceOf[String]
      )
    }.toOption
  }

  private def buildSyndication(metadataMap: Map[String, Any]): Option[SyndicationUsageMetadata] = {
    Try {
      SyndicationUsageMetadata(
        metadataMap("partnerName").asInstanceOf[String],
        metadataMap.get("syndicatedBy").map(x => x.asInstanceOf[String])
      )
    }.toOption
  }

  private def buildDigital(metadataMap: Map[String, Any]): Option[DigitalUsageMetadata] = {
    Try {
      DigitalUsageMetadata(
        URI.create(metadataMap("webUrl").asInstanceOf[String]),
        metadataMap("webTitle").asInstanceOf[String],
        metadataMap("sectionId").asInstanceOf[String],
        metadataMap.get("composerUrl").map(x => URI.create(x.asInstanceOf[String]))
      )
    }.toOption
  }

  private def buildPrint(metadataMap: Map[String, Any]): Option[PrintUsageMetadata] = {
    type JStringNumMap = java.util.LinkedHashMap[String, java.math.BigDecimal]
    Try {
      PrintUsageMetadata(
        sectionName = metadataMap.apply("sectionName").asInstanceOf[String],
        issueDate = metadataMap.get("issueDate").map(_.asInstanceOf[String])
          .map(ISODateTimeFormat.dateTimeParser().parseDateTime).get,
        pageNumber = metadataMap.apply("pageNumber").asInstanceOf[java.math.BigDecimal].intValue,
        storyName = metadataMap.apply("storyName").asInstanceOf[String],
        publicationCode = metadataMap.apply("publicationCode").asInstanceOf[String],
        publicationName = metadataMap.apply("publicationName").asInstanceOf[String],
        layoutId = metadataMap.get("layoutId").map(_.asInstanceOf[java.math.BigDecimal].intValue),
        edition = metadataMap.get("edition").map(_.asInstanceOf[java.math.BigDecimal].intValue),
        size = metadataMap.get("size")
          .map(_.asInstanceOf[JStringNumMap])
          .map(m => PrintImageSize(m.get("x").intValue, m.get("y").intValue)),
        orderedBy = metadataMap.get("orderedBy").map(_.asInstanceOf[String]),
        sectionCode = metadataMap.apply("sectionCode").asInstanceOf[String],
        notes = metadataMap.get("notes").map(_.asInstanceOf[String]),
        source = metadataMap.get("source").map(_.asInstanceOf[String])
      )
    }.toOption
  }

  private def buildPrintFromAttr(metadataMap: Map[String, AttributeValue]): Option[PrintUsageMetadata] = {
    Try {
      PrintUsageMetadata(
        sectionName = metadataMap.apply("sectionName").s(),
        issueDate = metadataMap.get("issueDate").map(_.s())
          .map(ISODateTimeFormat.dateTimeParser().parseDateTime).get,
        pageNumber = metadataMap.apply("pageNumber").n().toInt,
        storyName = metadataMap.apply("storyName").s(),
        publicationCode = metadataMap.apply("publicationCode").s(),
        publicationName = metadataMap.apply("publicationName").s(),
        layoutId = metadataMap.get("layoutId").map(_.n()).map(BigDecimal(_)).map(_.intValue),
        edition = metadataMap.get("edition").map(_.n()).map(BigDecimal(_)).map(_.intValue),
        size = metadataMap.get("size").map(_.m())
          .map(m => PrintImageSize(m.get("x").n().toInt, m.get("y").n().toInt)),
        orderedBy = metadataMap.get("orderedBy").map(_.s()),
        sectionCode = metadataMap.apply("sectionCode").s(),
        notes = metadataMap.get("notes").map(_.s()),
        source = metadataMap.get("source").map(_.s())
      )
    }.toOption
  }

  private def buildDownload(metadataMap: Map[String, String]): Option[DownloadUsageMetadata] = {
    Try {
      DownloadUsageMetadata(
        metadataMap("downloadedBy")
      )
    }.toOption
  }

  private def buildChild(metadataMap: Map[String, String]): Option[ChildUsageMetadata] = {
    Try {
      ChildUsageMetadata(
        metadataMap("addedBy"),
        metadataMap("childMediaId"),
      )
    }.toOption
  }
}
