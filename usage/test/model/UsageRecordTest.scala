package model

import com.gu.mediaservice.lib.dynamo.{DbInt, DbNestedMap, DbString}
import com.gu.mediaservice.model.usage.{ChildUsageMetadata, DigitalUsageMetadata, DownloadUsageMetadata, FrontUsageMetadata, PrintImageSize, PrintUsage, PrintUsageMetadata, SyndicationUsageMetadata}
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import org.joda.time.DateTime
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.net.URI
import scala.jdk.CollectionConverters.{CollectionHasAsScala, MapHasAsJava, MapHasAsScala}
class UsageRecordTest extends AnyFunSpec with Matchers {

  def getMapFromValues(rawValues: Iterable[AnyRef]) = {
    rawValues.collectFirst {
      case javaMap: java.util.Map[_, _] =>
        javaMap.asInstanceOf[java.util.Map[String, Any]].asScala.toMap
    }.getOrElse(fail("Could not find the value map"))
  }

  describe("toXSpec") {
    it("should handle an empty record with default/None values correctly") {
      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched
      )
      val spec = record.toXSpec
      val names = Option(spec.getNameMap).map(_.values().asScala)
      names shouldBe None

      val values = Option(spec.getValueMap).map(_.values().asScala)

      values shouldBe None

      val updateExpression = Option(spec.getUpdateExpression)
      updateExpression shouldBe Some("")
    }

    it("should include standard String and UsageType updates when present") {
      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched,
        mediaId = Some("media-789"),
        usageType = Some(PrintUsage),
        mediaType = Some("image"),
        usageStatus = Some("active")
      )

      val spec = record.toXSpec

      val names = spec.getNameMap.values().asScala

      names.size shouldBe 4
      names should contain ("media_id")
      names should contain ("usage_type")
      names should contain ("media_type")
      names should contain ("usage_status")

      val values = spec.getValueMap.values().asScala

      values.size shouldBe 4
      values should contain ("media-789")
      values should contain (PrintUsage.toString)
      values should contain ("image")
      values should contain ("active")

      spec.getUpdateExpression shouldEqual "SET #0 = :0, #1 = :1, #2 = :2, #3 = :3"

    }
  }

  describe("dateRemovedOperation") {
    it("should generate a set block when SetDateRemoved is specified") {

      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = SetDateRemoved(DateTime.now())
      )

      val spec = record.toXSpec
      val names = spec.getNameMap.values().asScala
      names.size shouldBe 1
      names should contain ("date_removed")

      spec.getUpdateExpression shouldEqual "SET #0 = :0"
    }

    it("should generate a REMOVE block when ClearDateRemoved is specified") {
      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = ClearDateRemoved
      )

      val spec = record.toXSpec

      val names = spec.getNameMap.values().asScala
      names.size shouldBe 1
      names should contain ("date_removed")
      spec.getUpdateExpression shouldEqual "REMOVE #0"
    }

    it("should handle a mix of remove and set updates when the relevant fields are set") {
      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = ClearDateRemoved,
        mediaId = Some("media-789")
      )

      val spec = record.toXSpec

      val names = spec.getNameMap.values().asScala
      names.size shouldBe 2
      names should contain ("date_removed")
      names should contain ("media_id")
      spec.getUpdateExpression shouldEqual "SET #0 = :0 REMOVE #1"
    }
  }

  describe("PrintUsageMetadata") {
    it("should handle PrintUsageMetadata with empty values") {
      val targetDate = DateTime.parse("2026-07-07T12:00:00Z")
      val metadata = PrintUsageMetadata(
        sectionName = "News",
        issueDate = targetDate,
        pageNumber = 5,
        storyName = "Scala Breakthrough",
        publicationCode = "PUB1",
        publicationName = "The Tech Daily",
        sectionCode = "SEC-A",
        layoutId = None,
        edition = None,
        size = None,
        orderedBy = None,
        notes = None,
        source = None
      )

      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched,
        printUsageMetadata = Some(metadata)
      )
      val spec = record.toXSpec
      val rawValues = spec.getValueMap.values().asScala

      val printMetadataMap: Map[String, Any] = getMapFromValues(rawValues)

      printMetadataMap("sectionName") shouldBe "News"
      printMetadataMap("issueDate") shouldBe "2026-07-07T12:00:00.000Z"
      printMetadataMap("pageNumber") shouldBe 5
      printMetadataMap("storyName") shouldBe "Scala Breakthrough"
      printMetadataMap("publicationCode") shouldBe "PUB1"
      printMetadataMap("publicationName") shouldBe "The Tech Daily"
      printMetadataMap("sectionCode") shouldBe "SEC-A"

      printMetadataMap should have size 7
    }
    it("should handle PrintUsageMetadata with full values set") {
      val targetDate = DateTime.parse("2026-07-07T12:00:00Z")
      val metadata = PrintUsageMetadata(
        sectionName = "News",
        issueDate = targetDate,
        pageNumber = 5,
        storyName = "Scala Breakthrough",
        publicationCode = "PUB1",
        publicationName = "The Tech Daily",
        sectionCode = "SEC-A",
        layoutId = Some(12345L),
        edition = Some(2),
        size = Some(PrintImageSize(1, 2)),
        orderedBy = Some("Alice"),
        notes = Some("Urgent print"),
        source = Some("Internal")
      )

      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched,
        printUsageMetadata = Some(metadata)
      )
      val spec = record.toXSpec
      val rawValues = spec.getValueMap.values().asScala

      val printMetadataMap: Map[String, Any] = getMapFromValues(rawValues)

      printMetadataMap("sectionName") shouldBe "News"
      printMetadataMap("issueDate") shouldBe "2026-07-07T12:00:00.000Z"
      printMetadataMap("pageNumber") shouldBe 5
      printMetadataMap("storyName") shouldBe "Scala Breakthrough"
      printMetadataMap("publicationCode") shouldBe "PUB1"
      printMetadataMap("publicationName") shouldBe "The Tech Daily"
      printMetadataMap("sectionCode") shouldBe "SEC-A"
      printMetadataMap("layoutId") shouldBe 12345
      printMetadataMap("edition") shouldBe 2
      printMetadataMap("size") shouldBe Map("x" -> 1, "y" -> 2).asJava
      printMetadataMap("orderedBy") shouldBe "Alice"
      printMetadataMap("notes") shouldBe "Urgent print"
      printMetadataMap("source") shouldBe "Internal"

      printMetadataMap should have size 13
    }
  }

  describe("UsageRecord Update Expressions - digitalUsageMetadata") {

    it("should correctly compile DigitalUsageMetadata with all optional fields present") {
      val metadata = DigitalUsageMetadata(
        webUrl = new URI("https://www.theguardian.com/tech"),
        webTitle = "Scala 3 adoption grows",
        sectionId = "technology",
        composerUrl = Some(new URI("https://composer.internal/123"))
      )

      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched,
        digitalUsageMetadata = Some(metadata)
      )

      val spec = record.toXSpec
      val rawValues = spec.getValueMap.values().asScala
      val digitalMetadataMap = getMapFromValues(rawValues)

      digitalMetadataMap shouldBe Map(
        "webUrl"      -> "https://www.theguardian.com/tech",
        "webTitle"    -> "Scala 3 adoption grows",
        "sectionId"   -> "technology",
        "composerUrl" -> "https://composer.internal/123"
      )
    }

    it("should fall back to placeholder when webTitle is empty and omit composerUrl when None") {
      val metadata = DigitalUsageMetadata(
        webUrl = new URI("https://www.theguardian.com/media"),
        webTitle = "",
        sectionId = "media",
        composerUrl = None
      )

      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched,
        digitalUsageMetadata = Some(metadata)
      )

      val spec = record.toXSpec
      val rawValues = spec.getValueMap.values().asScala
      val digitalMetadataMap = getMapFromValues(rawValues)
      digitalMetadataMap("webTitle") shouldBe "No title given"
      digitalMetadataMap.contains("composerUrl") shouldBe false
    }
  }
  describe("toExpression") {

    it("should handle an empty record with default/None values correctly") {
      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched
      )
      val expression = record.toExpression
      val names = expression.expressionNames().values().asScala
      names shouldBe empty

      val values = expression.expressionValues().values().asScala

      values shouldBe empty
      expression.expression() shouldBe ""
    }

    it("should include standard String and UsageType updates when present") {
      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = LeaveDateRemovedUntouched,
        mediaId = Some("media-789"),
        usageType = Some(PrintUsage),
        mediaType = Some("image"),
        usageStatus = Some("active")
      )

      val expression = record.toExpression

      val names = expression.expressionNames().values().asScala

      names.size shouldBe 4
      names should contain ("media_id")
      names should contain ("usage_type")
      names should contain ("media_type")
      names should contain ("usage_status")

      val values = expression.expressionValues().values().asScala
      values.size shouldBe 4
      values should contain (AttributeValue.builder.s("media-789").build())
      values should contain (AttributeValue.builder.s(PrintUsage.toString).build())
      values should contain (AttributeValue.builder.s("image").build())
      values should contain (AttributeValue.builder.s("active").build())

      val setExp = "SET #media_id = :media_id, #usage_type = :usage_type," +
        " #media_type = :media_type, #usage_status = :usage_status"

      expression.expression() shouldEqual setExp
    }
    describe("dateRemovedOperation") {
      it("should generate a set block when SetDateRemoved is specified") {

        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = SetDateRemoved(DateTime.now())
        )

        val expression = record.toExpression
        val names = expression.expressionNames().values().asScala
        names.size shouldBe 1
        names should contain ("date_removed")

        expression.expression() shouldEqual "SET #date_removed = :date_removed"
      }
      it("should generate a REMOVE block when ClearDateRemoved is specified") {
        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = ClearDateRemoved
        )

        val expression = record.toExpression
        expression.expression() shouldEqual "REMOVE #date_removed"
      }
      it("should handle a mix of remove and set updates when the relevant fields are set") {
        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = ClearDateRemoved,
          mediaId = Some("media-789")
        )

        val expression = record.toExpression

        val names = expression.expressionNames().values().asScala
        names.size shouldBe 1
        names should contain ("media_id")
        expression.expression() shouldEqual "SET #media_id = :media_id REMOVE #date_removed"
      }
    }
    describe("PrintUsageMetadata") {
      it("should handle PrintUsageMetadata with empty values") {
        val targetDate = DateTime.parse("2026-07-07T12:00:00Z")
        val metadata = PrintUsageMetadata(
          sectionName = "News",
          issueDate = targetDate,
          pageNumber = 5,
          storyName = "Scala Breakthrough",
          publicationCode = "PUB1",
          publicationName = "The Tech Daily",
          sectionCode = "SEC-A",
          layoutId = None,
          edition = None,
          size = None,
          orderedBy = None,
          notes = None,
          source = None
        )

        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = LeaveDateRemovedUntouched,
          printUsageMetadata = Some(metadata)
        )
        val expression = record.toExpression
        val rawValues = expression.expressionValues().values().asScala

        val printMetadataMap = rawValues.head.m().asScala

        printMetadataMap("sectionName") shouldBe DbString("News").toAttrValue
        printMetadataMap("issueDate") shouldBe DbString("2026-07-07T12:00:00.000Z").toAttrValue
        printMetadataMap("pageNumber") shouldBe DbInt(5).toAttrValue
        printMetadataMap("storyName") shouldBe DbString("Scala Breakthrough").toAttrValue
        printMetadataMap("publicationCode") shouldBe DbString("PUB1").toAttrValue
        printMetadataMap("publicationName") shouldBe DbString("The Tech Daily").toAttrValue
        printMetadataMap("sectionCode") shouldBe DbString("SEC-A").toAttrValue

        printMetadataMap should have size 7
      }
      it("should handle PrintUsageMetadata") {
        val targetDate = DateTime.parse("2026-07-07T12:00:00Z")
        val metadata = PrintUsageMetadata(
          sectionName = "News",
          issueDate = targetDate,
          pageNumber = 5,
          storyName = "Scala Breakthrough",
          publicationCode = "PUB1",
          publicationName = "The Tech Daily",
          sectionCode = "SEC-A",
          layoutId = Some(12345L),
          edition = Some(2),
          size = Some(PrintImageSize(1, 2)),
          orderedBy = Some("Alice"),
          notes = Some("Urgent print"),
          source = Some("Internal")
        )

        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = LeaveDateRemovedUntouched,
          printUsageMetadata = Some(metadata)
        )
        val expression = record.toExpression
        val rawValues = expression.expressionValues().values().asScala

        val printMetadataMap = rawValues.head.m().asScala
        printMetadataMap("sectionName") shouldBe DbString("News").toAttrValue
        printMetadataMap("issueDate") shouldBe DbString("2026-07-07T12:00:00.000Z").toAttrValue
        printMetadataMap("pageNumber") shouldBe DbInt(5).toAttrValue
        printMetadataMap("storyName") shouldBe DbString("Scala Breakthrough").toAttrValue
        printMetadataMap("publicationCode") shouldBe DbString("PUB1").toAttrValue
        printMetadataMap("publicationName") shouldBe DbString("The Tech Daily").toAttrValue
        printMetadataMap("sectionCode") shouldBe DbString("SEC-A").toAttrValue
        printMetadataMap("size") shouldBe DbNestedMap(Map("x" -> DbInt(1), "y" -> DbInt(2))).toAttrValue
        printMetadataMap("layoutId") shouldBe DbInt(12345).toAttrValue
        printMetadataMap("edition") shouldBe DbInt(2).toAttrValue
        printMetadataMap("orderedBy") shouldBe DbString("Alice").toAttrValue
        printMetadataMap("notes") shouldBe DbString("Urgent print").toAttrValue
        printMetadataMap("source") shouldBe DbString("Internal").toAttrValue

        printMetadataMap should have size 13
      }
    }
    describe("digitalUsageMetadata") {

      it("should correctly compile DigitalUsageMetadata with all optional fields present") {
        val metadata = DigitalUsageMetadata(
          webUrl = new URI("https://www.theguardian.com/tech"),
          webTitle = "Scala 3 adoption grows",
          sectionId = "technology",
          composerUrl = Some(new URI("https://composer.internal/123"))
        )

        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = LeaveDateRemovedUntouched,
          digitalUsageMetadata = Some(metadata)
        )

        val expression = record.toExpression
        val rawValues = expression.expressionValues().values().asScala

        val digitalMetadataMap = rawValues.head.m().asScala
        digitalMetadataMap shouldBe Map(
          "webUrl"      -> AttributeValue.builder().s("https://www.theguardian.com/tech").build(),
          "webTitle"    -> AttributeValue.builder().s("Scala 3 adoption grows").build(),
          "sectionId"   -> AttributeValue.builder().s("technology").build(),
          "composerUrl" -> AttributeValue.builder().s("https://composer.internal/123").build()
        )
      }

      it("should fall back to placeholder when webTitle is empty and omit composerUrl when None") {
        val metadata = DigitalUsageMetadata(
          webUrl = new URI("https://www.theguardian.com/media"),
          webTitle = "",
          sectionId = "media",
          composerUrl = None
        )

        val record = UsageRecord(
          hashKey = "hash-123",
          rangeKey = "range-456",
          dateRemovedOperation = LeaveDateRemovedUntouched,
          digitalUsageMetadata = Some(metadata)
        )

        val expression = record.toExpression
        val rawValues = expression.expressionValues().values().asScala

        val digitalMetadataMap = rawValues.head.m().asScala
        digitalMetadataMap("webTitle") shouldBe AttributeValue.builder().s("No title given").build()
        digitalMetadataMap.contains("composerUrl") shouldBe false
      }
    }

    it("should build a comprehensive Expression when all fields are populated") {
      val printMetadata = PrintUsageMetadata(
        sectionName = "News",
        issueDate = DateTime.parse("2026-07-08T12:00:00Z"),
        pageNumber = 5,
        storyName = "Scala Breakthrough",
        publicationCode = "PUB1",
        publicationName = "The Tech Daily",
        layoutId = Some(12345L),
        edition = Some(2),
        size = Some(PrintImageSize(10, 20)),
        orderedBy = Some("Alice"),
        sectionCode = "SEC-A",
        notes = Some("Urgent print"),
        source = Some("Internal")
      )

      val digitalMetadata = DigitalUsageMetadata(
        webUrl = new URI("https://www.theguardian.com/tech"),
        webTitle = "Scala adoption grows",
        sectionId = "technology",
        composerUrl = Some(new URI("https://composer.internal/123"))
      )

      val syndicationMetadata = SyndicationUsageMetadata(
        partnerName = "Reuters",
        syndicatedBy = Some("Bob")
      )

      val frontMetadata = FrontUsageMetadata(
        addedBy = "Charlie",
        front = "Main Front"
      )

      val downloadMetadata = DownloadUsageMetadata(
        downloadedBy = "David"
      )

      val childMetadata = ChildUsageMetadata(
        addedBy = "Eve",
        childMediaId = "child-999"
      )

      val fixedLastModified = DateTime.parse("2026-07-08T15:00:00Z")
      val fixedDateAdded = DateTime.parse("2026-07-08T10:00:00Z")
      val fixedDateRemoved = DateTime.parse("2026-07-08T18:00:00Z")

      val record = UsageRecord(
        hashKey = "hash-123",
        rangeKey = "range-456",
        dateRemovedOperation = SetDateRemoved(fixedDateRemoved),
        mediaId = Some("media-789"),
        usageType = Some(PrintUsage),
        mediaType = Some("image"),
        lastModified = Some(fixedLastModified),
        usageStatus = Some("active"),
        printUsageMetadata = Some(printMetadata),
        digitalUsageMetadata = Some(digitalMetadata),
        syndicationUsageMetadata = Some(syndicationMetadata),
        frontUsageMetadata = Some(frontMetadata),
        downloadUsageMetadata = Some(downloadMetadata),
        childUsageMetadata = Some(childMetadata),
        dateAdded = Some(fixedDateAdded)
      )

      val expression = record.toExpression

      val names = expression.expressionNames().values().asScala
      names should have size 13

      val expectedNames = List(
        "media_id", "usage_type", "media_type", "last_modified", "usage_status",
        "print_metadata", "digital_metadata", "syndication_metadata",
        "front_metadata", "download_metadata", "child_metadata", "date_added", "date_removed"
      )
      expectedNames.foreach { name => names should contain (name) }

      val values = expression.expressionValues().values().asScala
      values should have size 13

      values should contain (AttributeValue.builder().s("media-789").build())
      values should contain (AttributeValue.builder().s(PrintUsage.toString).build())
      values should contain (AttributeValue.builder().s("image").build())
      values should contain (AttributeValue.builder().n(fixedLastModified.getMillis.toString).build())
      values should contain (AttributeValue.builder().s("active").build())
      values should contain (AttributeValue.builder().n(fixedDateAdded.getMillis.toString).build())
      values should contain (AttributeValue.builder().n(fixedDateRemoved.getMillis.toString).build())

      val attributeMaps = values.collect { case av if av.hasM => av.m().asScala.toMap }

      val actualDigital = attributeMaps.find(_.contains("webUrl")).getOrElse(fail("Missing digital_metadata Map"))
      actualDigital("webUrl").s() shouldBe "https://www.theguardian.com/tech"
      actualDigital("webTitle").s() shouldBe "Scala adoption grows"
      actualDigital("sectionId").s() shouldBe "technology"
      actualDigital("composerUrl").s() shouldBe "https://composer.internal/123"

      val actualPrint = attributeMaps.find(_.contains("sectionName")).getOrElse(fail("Missing print_metadata Map"))
      actualPrint("sectionName").s() shouldBe "News"
      actualPrint("pageNumber").n() shouldBe "5"
      actualPrint("layoutId").n() shouldBe "12345"
      actualPrint("edition").n() shouldBe "2"
      actualPrint("orderedBy").s() shouldBe "Alice"
      actualPrint("sectionCode").s() shouldBe "SEC-A"
      actualPrint("notes").s() shouldBe "Urgent print"
      actualPrint("source").s() shouldBe "Internal"

      val actualSizeMap = actualPrint("size").m().asScala
      actualSizeMap("x").n() shouldBe "10"
      actualSizeMap("y").n() shouldBe "20"

      val actualSyndication = attributeMaps.find(_.contains("partnerName")).getOrElse(fail("Missing syndication_metadata Map"))
      actualSyndication("partnerName").s() shouldBe "Reuters"
      actualSyndication("syndicatedBy").s() shouldBe "Bob"

      val actualFront = attributeMaps.find(_.contains("front")).getOrElse(fail("Missing front_metadata Map"))
      actualFront("addedBy").s() shouldBe "Charlie"
      actualFront("front").s() shouldBe "Main Front"

      val actualDownload = attributeMaps.find(_.contains("downloadedBy")).getOrElse(fail("Missing download_metadata Map"))
      actualDownload("downloadedBy").s() shouldBe "David"

      val actualChild = attributeMaps.find(_.contains("childMediaId")).getOrElse(fail("Missing child_metadata Map"))
      actualChild("addedBy").s() shouldBe "Eve"
      actualChild("childMediaId").s() shouldBe "child-999"
      
      val expectedExpressionString =
        "SET #media_id = :media_id, #usage_type = :usage_type, #media_type = :media_type, " +
          "#last_modified = :last_modified, #usage_status = :usage_status, #print_metadata = :print_metadata, " +
          "#digital_metadata = :digital_metadata, #syndication_metadata = :syndication_metadata, " +
          "#front_metadata = :front_metadata, #download_metadata = :download_metadata, " +
          "#child_metadata = :child_metadata, #date_added = :date_added, #date_removed = :date_removed"

      expression.expression() shouldEqual expectedExpressionString
    }
  }
}
