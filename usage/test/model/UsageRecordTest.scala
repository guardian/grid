package model

import com.gu.mediaservice.model.usage.{DigitalUsageMetadata, PrintUsage, PrintUsageMetadata}
import org.joda.time.DateTime
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.net.URI
import scala.jdk.CollectionConverters.{CollectionHasAsScala, MapHasAsScala}
class UsageRecordTest extends AnyFunSpec with Matchers {

  def getMapFromValues(rawValues: Iterable[AnyRef]) = {
    rawValues.collectFirst {
      case javaMap: java.util.Map[_, _] =>
        javaMap.asInstanceOf[java.util.Map[String, Any]].asScala.toMap
    }.getOrElse(fail("Could not find the digital_metadata map in the value map"))
  }

  describe("updateExpressions") {
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
  }

  describe("PrintUsageMetadata") {
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
        size = None,
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

      printMetadataMap("sectionName")     shouldBe "News"
      printMetadataMap("issueDate")       shouldBe "2026-07-07T12:00:00.000Z"
      printMetadataMap("pageNumber")      shouldBe 5
      printMetadataMap("storyName")       shouldBe "Scala Breakthrough"
      printMetadataMap("publicationCode") shouldBe "PUB1"
      printMetadataMap("publicationName") shouldBe "The Tech Daily"
      printMetadataMap("sectionCode")     shouldBe "SEC-A"
      printMetadataMap("layoutId")        shouldBe 12345
      printMetadataMap("edition")         shouldBe 2
      printMetadataMap("orderedBy")       shouldBe "Alice"
      printMetadataMap("notes")           shouldBe "Urgent print"
      printMetadataMap("source")          shouldBe "Internal"

      printMetadataMap should have size 12
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
  }
}
