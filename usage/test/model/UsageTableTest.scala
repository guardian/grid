package model

import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage._
import lib.WithLogMarker
import org.joda.time.DateTime
import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json
import rx.lang.scala.Observable
import software.amazon.awssdk.core.pagination.sync.SdkIterable
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbTable
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.enhanced.dynamodb.model.{PageIterable, QueryEnhancedRequest}
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.{AttributeValue, UpdateItemRequest, UpdateItemResponse}

import java.util.Collections
import scala.concurrent.duration._
import scala.concurrent.{Await, Promise}
import scala.jdk.CollectionConverters._

class UsageTableTest extends AnyFunSuite with Matchers with MockitoSugar {

  private implicit val logMarker: MarkerMap = MarkerMap("test" -> "usage-table")

  private def mediaUsage: MediaUsage = MediaUsage(
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

  private def usageTable(dbClient: DynamoDbClient, enhancedTable: DynamoDbTable[EnhancedDocument]): UsageTable =
    new UsageTable(null) {
      override lazy val client: DynamoDbClient = dbClient
      override lazy val table: DynamoDbTable[EnhancedDocument] = enhancedTable
    }

  private def awaitSingle[A](observable: Observable[A]): A = {
    val result = Promise[A]()
    observable.subscribe(
      value => result.trySuccess(value),
      error => result.tryFailure(error)
    )
    Await.result(result.future, 5.seconds)
  }

  private def awaitFailure[A](observable: Observable[A]): Throwable = {
    val result = Promise[Throwable]()
    observable.subscribe(
      (_: A) => (),
      error => result.trySuccess(error),
      () => ()
    )
    Await.result(result.future, 5.seconds)
  }

  test("matchUsageGroup performs a strongly consistent query and preserves the log marker") {
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    val queryResult = mock[PageIterable[EnhancedDocument]]
    val items = mock[SdkIterable[EnhancedDocument]]
    when(enhancedTable.query(any[QueryEnhancedRequest])).thenReturn(queryResult)
    when(queryResult.items()).thenReturn(items)
    when(items.iterator()).thenReturn(Collections.emptyIterator[EnhancedDocument]())

    val group = UsageGroup(Set.empty, "group-1", DateTime.parse("2026-11-01T12:00:00Z"))
    val result = awaitSingle(usageTable(mock[DynamoDbClient], enhancedTable)
      .matchUsageGroup(WithLogMarker(logMarker, group)))

    result.value shouldBe empty
    result.logMarker shouldBe logMarker

    val request = ArgumentCaptor.forClass(classOf[QueryEnhancedRequest])
    verify(enhancedTable).query(request.capture())
    request.getValue.consistentRead() shouldBe java.lang.Boolean.TRUE
  }

  test("matchUsageGroup transforms returned table documents into media usages") {
    val expected = mediaUsage
    val document = EnhancedDocument.fromAttributeValueMap(Map(
      "usage_id" -> AttributeValue.builder().s(expected.usageId.toString).build(),
      "grouping" -> AttributeValue.builder().s(expected.grouping).build(),
      "media_id" -> AttributeValue.builder().s(expected.mediaId).build(),
      "usage_type" -> AttributeValue.builder().s(expected.usageType.toString).build(),
      "media_type" -> AttributeValue.builder().s(expected.mediaType).build(),
      "usage_status" -> AttributeValue.builder().s(expected.status.toString).build(),
      "last_modified" -> AttributeValue.builder().n(expected.lastModified.getMillis.toString).build()
    ).asJava)
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    val queryResult = mock[PageIterable[EnhancedDocument]]
    val items = mock[SdkIterable[EnhancedDocument]]
    when(enhancedTable.query(any[QueryEnhancedRequest])).thenReturn(queryResult)
    when(queryResult.items()).thenReturn(items)
    when(items.iterator()).thenReturn(Collections.singletonList(document).iterator())

    val group = UsageGroup(Set.empty, expected.grouping, expected.lastModified)
    val result = awaitSingle(usageTable(mock[DynamoDbClient], enhancedTable)
      .matchUsageGroup(WithLogMarker(logMarker, group)))

    result.value shouldBe Set(expected)
  }

  test("matchUsageGroup propagates DynamoDB query failures") {
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    val failure = new IllegalStateException("DynamoDB unavailable")
    when(enhancedTable.query(any[QueryEnhancedRequest])).thenThrow(failure)

    awaitFailure(usageTable(mock[DynamoDbClient], enhancedTable)
      .matchUsageGroup(WithLogMarker(logMarker, UsageGroup(Set.empty, "group-1", DateTime.now())))) shouldBe failure
  }

  test("create, update, and markAsRemoved issue the corresponding update expressions") {
    val dbClient = mock[DynamoDbClient]
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    when(enhancedTable.tableName()).thenReturn("usage-records")
    when(dbClient.updateItem(any[UpdateItemRequest])).thenReturn(
      UpdateItemResponse.builder()
        .attributes(Map(
          "grouping" -> AttributeValue.builder().s("group-1").build(),
          "usage_id" -> AttributeValue.builder().s("usage-1").build(),
          "media_id" -> AttributeValue.builder().s("media-1").build()
        ).asJava)
        .build()
    )

    val table = usageTable(dbClient, enhancedTable)
    awaitSingle(table.create(mediaUsage))
    awaitSingle(table.update(mediaUsage))
    awaitSingle(table.markAsRemoved(mediaUsage))

    val request = ArgumentCaptor.forClass(classOf[UpdateItemRequest])
    verify(dbClient, org.mockito.Mockito.times(3)).updateItem(request.capture())
    val expressions = request.getAllValues.asScala.map(_.updateExpression()).toList

    expressions.head should include ("REMOVE date_removed")
    expressions.head should include ("#date_added = :date_added")
    expressions(1) should include ("#media_id = :media_id")
    expressions(1) should not include "date_removed"
    expressions(2) shouldBe "SET #date_removed = :date_removed"
  }

  test("upsertFromRecord propagates DynamoDB failures") {
    val dbClient = mock[DynamoDbClient]
    val enhancedTable = mock[DynamoDbTable[EnhancedDocument]]
    val failure = new IllegalStateException("DynamoDB unavailable")
    when(enhancedTable.tableName()).thenReturn("usage-records")
    when(dbClient.updateItem(any[UpdateItemRequest])).thenThrow(failure)

    awaitFailure(usageTable(dbClient, enhancedTable).create(mediaUsage)) shouldBe failure
  }
}
