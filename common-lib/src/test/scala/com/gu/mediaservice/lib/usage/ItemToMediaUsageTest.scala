package com.gu.mediaservice.lib.usage

import com.amazonaws.services.dynamodbv2.document.Item
import software.amazon.awssdk.enhanced.dynamodb.EnhancedType
import com.gu.mediaservice.model.usage.{ChildUsageMetadata, DigitalUsageMetadata, DownloadUsageMetadata, FrontUsageMetadata, MediaUsage, PrintImageSize, PrintUsageMetadata, SyndicationUsageMetadata, UsageId, UsageStatus, UsageType}
import org.joda.time.DateTime
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper
import software.amazon.awssdk.enhanced.dynamodb.DefaultAttributeConverterProvider
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument

import scala.jdk.CollectionConverters.MapHasAsJava
import java.math.BigDecimal
import java.net.URI

class ItemToMediaUsageTest extends AnyFunSuiteLike {

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

  val downloadMetadata = Map[String, String](
    "downloadedBy" -> "designer123"
  ).asJava

  val childMetadata = Map[String, String](
    "addedBy"      -> "parent_editor",
    "childMediaId" -> "child-media-999"
  ).asJava

  test("testTransform dynamo v1") {

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

  test("testTransform dynamo v2 with simple fields") {
    val enchancedDoc = EnhancedDocument.builder()
      .attributeConverterProviders(DefaultAttributeConverterProvider.create())
      .putString("usage_id", "usage-123")
      .putString("grouping","group-abc")
      .putString("media_id", "media-789")
      .putString("usage_type", "print")
      .putString("media_type", "image")
      .putString("usage_status", "pending")
      .putNumber("last_modified", lastModifiedMillis)
      .putNumber("date_added", dateAddedMillis)
      .putNumber("date_removed", dateRemovedMillis)
      .build()

    val mediaUsage = ItemToMediaUsage.transform(enchancedDoc)

    mediaUsage shouldEqual MediaUsage(
      UsageId("usage-123"),
      "group-abc",
      "media-789",
      UsageType("print"),
      "image",
      UsageStatus("pending"),
      None,
      None,
      None,
      None,
      None,
      None,
      new DateTime(lastModifiedMillis),
      Some(new DateTime(dateAddedMillis)),
      Some(new DateTime(dateRemovedMillis))
    )
  }

  test("testTransform dynamo v2 with complex fields") {
    val enchancedDoc = EnhancedDocument.builder()
      .attributeConverterProviders(DefaultAttributeConverterProvider.create())
      .putString("usage_id", "usage-123")
      .putString("grouping","group-abc")
      .putString("media_id", "media-789")
      .putString("usage_type", "print")
      .putString("media_type", "image")
      .putString("usage_status", "pending")
      .putNumber("last_modified", lastModifiedMillis)
      .putNumber("date_added", dateAddedMillis)
      .putNumber("date_removed", dateRemovedMillis)
      .putMap("download_metadata", downloadMetadata, EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String]))
      .putMap("child_metadata", childMetadata, EnhancedType.of(classOf[String]), EnhancedType.of(classOf[String]))
      .build()

    val mediaUsage = ItemToMediaUsage.transform(enchancedDoc)

    mediaUsage.downloadUsageMetadata shouldEqual  Some(DownloadUsageMetadata("designer123"))
    mediaUsage.childUsageMetadata shouldEqual  Some(ChildUsageMetadata("parent_editor", "child-media-999"))
  }

}
