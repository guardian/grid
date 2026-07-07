package model

import com.gu.mediaservice.lib.aws.DynamoDB.{avToAny, jsonWithNullAsEmptyString}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.lib.usage.ItemToMediaUsage
import com.gu.mediaservice.model.usage.{MediaUsage, PendingUsageStatus, PublishedUsageStatus, UsageTableFullKey}
import lib.{BadInputException, UsageConfig, WithLogMarker}
import play.api.libs.json._
import rx.lang.scala.Observable
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.enhanced.dynamodb.model.{DeleteItemEnhancedRequest, QueryConditional, QueryEnhancedRequest, UpdateItemEnhancedRequest}
import software.amazon.awssdk.enhanced.dynamodb.{AttributeConverterProvider, AttributeValueType, DynamoDbEnhancedClient, Key, TableMetadata, TableSchema}
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.{AttributeValue, ReturnValue, UpdateItemRequest}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.jdk.CollectionConverters.{IterableHasAsScala, IteratorHasAsScala, MapHasAsJava, MapHasAsScala}

class UsageTable(config: UsageConfig) extends GridLogging {

  val hashKeyName = "grouping"
  val rangeKeyName = "usage_id"
  val imageIndexName = "media_id"


  lazy val client: DynamoDbClient = config.withAWSCredentialsV2(DynamoDbClient.builder()).build()
  lazy val dynamo: DynamoDbEnhancedClient = DynamoDbEnhancedClient.builder().dynamoDbClient(client).build()
  lazy val tableSchema = TableSchema.documentSchemaBuilder()
    .addIndexPartitionKey(TableMetadata.primaryIndexName(), hashKeyName, AttributeValueType.S)
    .addIndexSortKey(TableMetadata.primaryIndexName(), rangeKeyName, AttributeValueType.S)
    .addIndexPartitionKey(
      "MediaIdIndex",
      imageIndexName,
      AttributeValueType.S
    )
    .attributeConverterProviders(AttributeConverterProvider.defaultProvider())
    .build()
  lazy val table = dynamo.table(config.usageRecordTable, tableSchema)

  def queryByUsageId(id: String): Future[Option[MediaUsage]] = Future {
    UsageTableFullKey.build(id).flatMap((tableFullKey: UsageTableFullKey) => {

      val key = Key.builder()
        .partitionValue(tableFullKey.hashKey)
        .sortValue(tableFullKey.rangeKey)
        .build()
      val queryResult = table.query(QueryConditional.keyEqualTo(key))
      queryResult.items().asScala.map(ItemToMediaUsage.transform).headOption
    })
  }

  def queryByImageId(id: String)(implicit logMarkerWithId: LogMarker): Future[List[MediaUsage]] = Future {

    if (id.trim.isEmpty)
      throw new BadInputException("Empty string received for image id")

    logger.info(logMarkerWithId, s"Querying usages table for $id")

    val key = Key.builder()
      .partitionValue(id)
      .build()

    val queryResult = table.index("MediaIdIndex").query(QueryConditional.keyEqualTo(key))

    val unsortedUsages = queryResult.iterator()
      .asScala
      .flatMap(_.items().asScala)
      .map(ItemToMediaUsage.transform)
      .toList

    logger.info(logMarkerWithId, s"Query of usages table for $id found ${unsortedUsages.size} results")

    val sortedByLastModifiedNewestFirst = unsortedUsages.sortBy(_.lastModified.getMillis).reverse

    hidePendingIfPublished(
      hidePendingIfRemoved(
        sortedByLastModifiedNewestFirst
      )
    )
  }

  def hidePendingIfRemoved(usages: List[MediaUsage]): List[MediaUsage] = usages.filterNot((mediaUsage: MediaUsage) => {
    mediaUsage.status match {
      case PendingUsageStatus => mediaUsage.isRemoved
      case _ => false
    }
  })

  def hidePendingIfPublished(usages: List[MediaUsage]): List[MediaUsage] = usages.groupBy(_.grouping).flatMap {
    case (_, groupedUsages) =>
      val publishedUsage = groupedUsages.find(_.status match {
        case PublishedUsageStatus => true
        case _ => false
      })

      if (publishedUsage.isEmpty) {
          groupedUsages.headOption
      } else {
          publishedUsage
      }
  }.toList

  def matchUsageGroup(usageGroupWithContext: WithLogMarker[UsageGroup]): Observable[WithLogMarker[Set[MediaUsage]]] = {
    implicit val logMarker: LogMarker = usageGroupWithContext.logMarker
    val usageGroup = usageGroupWithContext.value

    logger.info(logMarker, s"Trying to match UsageGroup: ${usageGroup.grouping}")

    Observable.from(Future {
      val grouping = usageGroup.grouping

      logger.info(logMarker, s"Querying table for $grouping")
      val key = Key.builder()
        .partitionValue(grouping)
        .build()
      val request =
        QueryEnhancedRequest.builder()
          .queryConditional(QueryConditional.keyEqualTo(key))
          .consistentRead(true)
          .build()
      val queryResult = table.query(request)

      val usages = queryResult.items().asScala
        .map(ItemToMediaUsage.transform)
        .toSet

      logger.info(logMarker, s"Built matched UsageGroup ${usageGroup.grouping} (${usages.size})")

      WithLogMarker(usages)
    })
  }

  def create(mediaUsage: MediaUsage)(implicit logMarker: LogMarker): Observable[JsObject] =
    upsertFromRecord(UsageRecord.buildCreateRecord(mediaUsage))

  def update(mediaUsage: MediaUsage)(implicit logMarker: LogMarker): Observable[JsObject] =
    upsertFromRecord(UsageRecord.buildUpdateRecord(mediaUsage))

  def markAsRemoved(mediaUsage: MediaUsage)(implicit logMarker: LogMarker): Observable[JsObject] =
    upsertFromRecord(UsageRecord.buildMarkAsRemovedRecord(mediaUsage))

  def deleteRecord(mediaUsage: MediaUsage)(implicit logMarker: LogMarker): EnhancedDocument = {
    logger.info(logMarker, s"deleting usage ${mediaUsage.usageId} for media id ${mediaUsage.mediaId}")

    val key = Key.builder()
      .partitionValue(mediaUsage.grouping)
      .sortValue(mediaUsage.usageId.toString)
      .build()

    table.deleteItem(DeleteItemEnhancedRequest.builder().key(key).build())
  }

  def upsertFromRecord(record: UsageRecord)(implicit logMarker: LogMarker): Observable[JsObject] = Observable.from(Future {
      val key = Map(
        hashKeyName -> AttributeValue.builder().s(record.hashKey).build(),
        rangeKeyName -> AttributeValue.builder().s(record.rangeKey).build()
      ).asJava

      val request = UpdateItemRequest.builder()
        .tableName(table.tableName())
        .key(key)
        .updateExpression(record.toExpression.expression())
        .expressionAttributeNames(record.toExpression.expressionNames())
        .expressionAttributeValues(record.toExpression.expressionValues())
        .returnValues(ReturnValue.ALL_NEW)
        .build()

      client.updateItem(request)

  })
  .onErrorResumeNext(e => {
    logger.error(logMarker, s"Dynamo update fail for $record!", e)
    Observable.error(e)
  })
  .map(updateResponse => {
    val doc = EnhancedDocument.fromAttributeValueMap(updateResponse.attributes())
    jsonWithNullAsEmptyString(Json.parse(doc.toJson)).as[JsObject]
  })
}
