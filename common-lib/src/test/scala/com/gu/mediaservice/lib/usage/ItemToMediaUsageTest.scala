package com.gu.mediaservice.lib.usage

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.mediaservice.model.usage.{ChildUsageMetadata, DigitalUsageMetadata, DownloadUsageMetadata, FrontUsageMetadata, MediaUsage, PrintImageSize, PrintUsageMetadata, SyndicationUsageMetadata, UsageId, UsageStatus, UsageType}
import org.joda.time.DateTime
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

import scala.jdk.CollectionConverters.MapHasAsJava
import java.math.BigDecimal
import java.net.URI

class ItemToMediaUsageTest extends AnyFunSuiteLike {

  test("testTransform dynamo v1") {

    val lastModifiedMillis = 1700000000000L
    val dateAddedMillis    = 1700000100000L
    val dateRemovedMillis  = 1700000200000L
    val printSizeMap = new java.util.LinkedHashMap[String, java.math.BigDecimal]()
    printSizeMap.put("x", new BigDecimal(100))
    printSizeMap.put("y", new BigDecimal(200))

    val printMetadata = Map[String, Any](
      "sectionName"     -> "News",
      "issueDate"       -> "2026-07-20T10:00:00.000Z",
      "pageNumber"      -> new BigDecimal(5),
      "storyName"       -> "Lead Story",
      "publicationCode" -> "GND",
      "publicationName" -> "The Guardian",
      "layoutId"        -> new BigDecimal(12),
      "edition"         -> new BigDecimal(1),
      "size"            -> printSizeMap,
      "orderedBy"       -> "editor1",
      "sectionCode"     -> "GND-NEWS",
      "notes"           -> "Top priority",
      "source"          -> "Desk"
    ).asJava

    val digitalMetadata = Map[String, Any](
      "webUrl"      -> "https://www.theguardian.com/world/2026/jul/20/article",
      "webTitle"    -> "Breaking News",
      "sectionId"   -> "world",
      "composerUrl" -> "https://composer.gutools.co.uk/content/123"
    ).asJava

    val syndicationMetadata = Map[String, Any](
      "partnerName"  -> "Reuters",
      "syndicatedBy" -> "syndication_user"
    ).asJava

    val frontMetadata = Map[String, Any](
      "addedBy" -> "front_editor",
      "front"   -> "uk-news"
    ).asJava

    val downloadMetadata = Map[String, Any](
      "downloadedBy" -> "designer123"
    ).asJava

    val childMetadata = Map[String, Any](
      "addedBy"      -> "parent_editor",
      "childMediaId" -> "child-media-999"
    ).asJava

    val item = new Item()
      .withString("usage_id", "usage-123")
      .withString("grouping", "group-abc")
      .withString("media_id", "media-789")
      .withString("usage_type", "print")
      .withString("media_type", "image")
      .withString("usage_status", "pending")
      .withMap("print_metadata", printMetadata)
      .withMap("digital_metadata", digitalMetadata)
      .withMap("syndication_metadata", syndicationMetadata)
      .withMap("front_metadata", frontMetadata)
      .withMap("download_metadata", downloadMetadata)
      .withMap("child_metadata", childMetadata)
      .withLong("last_modified", lastModifiedMillis)
      .withLong("date_added", dateAddedMillis)
      .withLong("date_removed", dateRemovedMillis)

    val mediaUsage = ItemToMediaUsage.transform(item)


    mediaUsage shouldEqual MediaUsage(
      UsageId("usage-123"),
      "group-abc",
      "media-789",
      UsageType("print"),
      "image",
      UsageStatus("pending"),
      Some(PrintUsageMetadata(
        sectionName = "News",
        issueDate = new DateTime("2026-07-20T10:00:00.000Z"),
        pageNumber = 5,
        storyName = "Lead Story",
        publicationCode = "GND",
        publicationName = "The Guardian",
        layoutId = Some(12),
        edition = Some(1),
        size = Some(PrintImageSize(100, 200)),
        orderedBy = Some("editor1"),
        sectionCode = "GND-NEWS",
        notes = Some("Top priority"),
        source = Some("Desk")
      )),
      Some(
        DigitalUsageMetadata(
          URI.create("https://www.theguardian.com/world/2026/jul/20/article"),
          "Breaking News",
          "world",
          Some(URI.create("https://composer.gutools.co.uk/content/123"))
        )
      ),
      Some(
        SyndicationUsageMetadata("Reuters", Some("syndication_user"))
      ),
      Some(FrontUsageMetadata("front_editor", "uk-news")),
      Some(DownloadUsageMetadata("designer123")),
      Some(ChildUsageMetadata("parent_editor", "child-media-999")),
      new DateTime(lastModifiedMillis),
      Some(new DateTime(dateAddedMillis)),
      Some(new DateTime(dateRemovedMillis))
    )
  }

  test("testTransform dynamo v2") {

  }

}
