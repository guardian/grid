package com.gu.mediaservice.lib.usage

import java.net.URI
import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument

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
      Option(doc.getMapOfUnknownType("print_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildPrint),
      Option(doc.getMapOfUnknownType("digital_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildDigital),
      Option(doc.getMapOfUnknownType("syndication_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildSyndication),
      Option(doc.getMapOfUnknownType("front_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildFront),
      Option(doc.getMapOfUnknownType("download_metadata"))
        .map(_.asScala.toMap)
        .flatMap(buildDownload),
      Option(doc.getMapOfUnknownType("child_metadata"))
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

  private def buildDownload(metadataMap: Map[String, Any]): Option[DownloadUsageMetadata] = {
    Try {
      DownloadUsageMetadata(
        metadataMap("downloadedBy").asInstanceOf[String]
      )
    }.toOption
  }

  private def buildChild(metadataMap: Map[String, Any]): Option[ChildUsageMetadata] = {
    Try {
      ChildUsageMetadata(
        metadataMap("addedBy").asInstanceOf[String],
        metadataMap("childMediaId").asInstanceOf[String],
      )
    }.toOption
  }
}
