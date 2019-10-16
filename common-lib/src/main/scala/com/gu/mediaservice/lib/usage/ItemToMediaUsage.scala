package com.gu.mediaservice.lib.usage

import java.net.URI

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat

import scala.collection.JavaConverters._
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
      Option(item.getMap[Any]("download_metadata"))
        .map(_.asScala.toMap).flatMap(buildDownload),
      new DateTime(item.getLong("last_modified")),
      Try {
        item.getLong("date_added")
      }.toOption.map(new DateTime(_)),
      Try {
        item.getLong("date_removed")
      }.toOption.map(new DateTime(_))
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
        metadataMap("partnerName").asInstanceOf[String]
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
}
