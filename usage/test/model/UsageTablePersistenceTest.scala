package model

import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage._
import lib.{UsageEffectTestSupport, WithLogMarker}
import org.joda.time.DateTime
import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{times, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json
import software.amazon.awssdk.enhanced.dynamodb.{DynamoDbTable, TableMetadata}
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.enhanced.dynamodb.model.QueryEnhancedRequest
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.{AttributeValue, ReturnValue, UpdateItemRequest, UpdateItemResponse}

import java.util.Collections
import scala.jdk.CollectionConverters._

class UsageTablePersistenceTest extends AnyFunSuite with Matchers with MockitoSugar {

  private implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-table-persistence")

  private val mediaUsage = MediaUsage(
    usageId = UsageId("usage-1"),
    grouping = "group-1",
    mediaId = "media-1",
    usageType = DigitalUsage,
    mediaType = "image",
    status = PublishedUsageStatus,
    printUsageMetadata = None,
    digitalUsageMetadata = None,
    syndicationUsageMetadata = None,
    frontUsageMetadata = None,
    downloadUsageMetadata = None,
    childUsageMetadata = None,
    lastModified = DateTime.parse("2026-11-01T12:00:00Z")
  )

  private def usageTable(
    dbClient: DynamoDbClient,
    enhancedTable: DynamoDbTable[EnhancedDocument]
  ): UsageTable = new UsageTable(null) {
    override lazy val client: DynamoDbClient = dbClient
    override lazy val table: DynamoDbTable[EnhancedDocument] = enhancedTable
  }

  test("matchUsageGroup queries by the grouping partition key") {
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    val queryResult = mock[software.amazon.awssdk.enhanced.dynamodb.model.PageIterable[EnhancedDocument]]
    val items = mock[software.amazon.awssdk.core.pagination.sync.SdkIterable[EnhancedDocument]]
    when(enhancedTable.query(any[QueryEnhancedRequest])).thenReturn(queryResult)
    when(queryResult.items()).thenReturn(items)
    when(items.iterator()).thenReturn(Collections.emptyIterator[EnhancedDocument]())
    val table = usageTable(mock[DynamoDbClient], enhancedTable)
    val group = UsageGroup(Set.empty, "group-1", mediaUsage.lastModified)

    UsageEffectTestSupport.await(table.matchUsageGroup(WithLogMarker(logMarker, group)))

    val request = ArgumentCaptor.forClass(classOf[QueryEnhancedRequest])
    verify(enhancedTable).query(request.capture())
    val condition = request.getValue.queryConditional().expression(table.tableSchema, TableMetadata.primaryIndexName())
    condition.expression() should include("grouping")
    condition.expressionValues().asScala.values.map(_.s()).toSet should contain("group-1")
  }

  test("create, update, and remove return converted attributes and send the full update request") {
    val dbClient = mock[DynamoDbClient]
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    when(enhancedTable.tableName()).thenReturn("usage-records")
    val attributes = Map(
      "grouping" -> AttributeValue.builder().s("group-1").build(),
      "usage_id" -> AttributeValue.builder().s("usage-1").build(),
      "media_id" -> AttributeValue.builder().s("media-1").build(),
      "optional_value" -> AttributeValue.builder().nul(true).build()
    )
    when(dbClient.updateItem(any[UpdateItemRequest])).thenReturn(
      UpdateItemResponse.builder().attributes(attributes.asJava).build()
    )
    val table = usageTable(dbClient, enhancedTable)

    val results = List(
      UsageEffectTestSupport.await(table.create(mediaUsage)),
      UsageEffectTestSupport.await(table.update(mediaUsage)),
      UsageEffectTestSupport.await(table.markAsRemoved(mediaUsage))
    )

    results shouldBe List(
      Json.obj(
        "grouping" -> "group-1",
        "usage_id" -> "usage-1",
        "media_id" -> "media-1",
        "optional_value" -> ""
      ),
      Json.obj(
        "grouping" -> "group-1",
        "usage_id" -> "usage-1",
        "media_id" -> "media-1",
        "optional_value" -> ""
      ),
      Json.obj(
        "grouping" -> "group-1",
        "usage_id" -> "usage-1",
        "media_id" -> "media-1",
        "optional_value" -> ""
      )
    )

    val requests = ArgumentCaptor.forClass(classOf[UpdateItemRequest])
    verify(dbClient, times(3)).updateItem(requests.capture())
    requests.getAllValues.asScala.foreach { request =>
      request.tableName() shouldBe "usage-records"
      request.returnValues() shouldBe ReturnValue.ALL_NEW
      request.key().asScala.map { case (key, value) => key -> value.s() }.toMap shouldBe Map(
        "grouping" -> "group-1",
        "usage_id" -> "usage-1"
      )
    }
  }
}
