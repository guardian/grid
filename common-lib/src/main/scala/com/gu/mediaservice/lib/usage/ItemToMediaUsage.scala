package com.gu.mediaservice.lib.usage

import java.net.URI

import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import software.amazon.awssdk.enhanced.dynamodb.{DefaultAttributeConverterProvider, EnhancedType}
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.services.dynamodb.model.AttributeValue

import scala.jdk.CollectionConverters._
import scala.util.Try

object ItemToMediaUsage {
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
      Option(doc.getMap("digital_metadata", EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String])))
        .map(_.asScala.toMap)
        .flatMap(buildDigital),
      Option(doc.getMap("syndication_metadata", EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String])))
        .map(_.asScala.toMap)
        .flatMap(buildSyndication),
      Option(doc.getMap("front_metadata", EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String])))
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


  private def buildFront(metadataMap: Map[String, String]): Option[FrontUsageMetadata] = {
    Try {
      FrontUsageMetadata(
        metadataMap("addedBy"),
        metadataMap("front")
      )
    }.toOption
  }

  private def buildSyndication(metadataMap: Map[String, String]): Option[SyndicationUsageMetadata] = {
    Try {
      SyndicationUsageMetadata(
        metadataMap("partnerName"),
        metadataMap.get("syndicatedBy")
      )
    }.toOption
  }

  private def buildDigital(metadataMap: Map[String, String]): Option[DigitalUsageMetadata] = {
    Try {
      DigitalUsageMetadata(
        URI.create(metadataMap("webUrl")),
        metadataMap("webTitle"),
        metadataMap("sectionId"),
        metadataMap.get("composerUrl").map(x => URI.create(x))
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
