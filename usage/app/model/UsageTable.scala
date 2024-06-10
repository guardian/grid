package model

import com.amazonaws.services.dynamodbv2.document.spec.{DeleteItemSpec, QuerySpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.{DeleteItemOutcome, KeyAttribute, RangeKeyCondition}
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.lib.usage.ItemToMediaUsage
import com.gu.mediaservice.model.Instance
import com.gu.mediaservice.model.usage.{MediaUsage, PendingUsageStatus, PublishedUsageStatus, UsageTableFullKey}
import lib.{BadInputException, UsageConfig, WithLogMarker}
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.jdk.CollectionConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class UsageTable(config: UsageConfig) extends DynamoDB(config, config.usageRecordTable) with GridLogging {  // TODO Not instane aware!

  val hashKeyName = "grouping"
  val rangeKeyName = "usage_id"
  val imageIndexName = "media_id"

  def queryByUsageId(id: String): Future[Option[MediaUsage]] = Future {
    UsageTableFullKey.build(id).flatMap((tableFullKey: UsageTableFullKey) => {
      val keyAttribute: KeyAttribute = new KeyAttribute(hashKeyName, tableFullKey.hashKey)
      val rangeKeyCondition: RangeKeyCondition = new RangeKeyCondition(rangeKeyName).eq(tableFullKey.rangeKey)

      val queryResult = table.query(keyAttribute, rangeKeyCondition)

      queryResult.asScala.map(ItemToMediaUsage.transform).headOption
    })
  }

  def queryByImageId(id: String)(implicit logMarkerWithId: LogMarker): Future[List[MediaUsage]] = Future {

    if (id.trim.isEmpty)
      throw new BadInputException("Empty string received for image id")

    logger.info(logMarkerWithId, s"Querying usages table for $id")
    val imageIndex = table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)

    val unsortedUsages = queryResult.asScala.map(ItemToMediaUsage.transform).toList

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

  def matchUsageGroup(usageGroupWithContext: WithLogMarker[(UsageGroup, Instance)]): Observable[WithLogMarker[Set[MediaUsage]]] = {
    implicit val logMarker: LogMarker = usageGroupWithContext.logMarker
    val usageGroup = usageGroupWithContext.value._1
    val instance = usageGroupWithContext.value._2

    logger.info(logMarker, s"Trying to match UsageGroup: ${usageGroup.grouping}")

    Observable.from(Future {
      val grouping = usageGroup.grouping

      logger.info(logMarker, s"Querying table for $grouping")
      val queryResult = table.query(
        new QuerySpec()
          .withConsistentRead(true)
          .withHashKey(new KeyAttribute("grouping", grouping))
      )

      val usages = queryResult.asScala
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

  def deleteRecord(mediaUsage: MediaUsage)(implicit logMarker: LogMarker): DeleteItemOutcome = {
    logger.info(logMarker, s"deleting usage ${mediaUsage.usageId} for media id ${mediaUsage.mediaId}")

    val deleteSpec = new DeleteItemSpec()
      .withPrimaryKey(
        hashKeyName, mediaUsage.grouping,
        rangeKeyName, mediaUsage.usageId.toString
      )

    table.deleteItem(deleteSpec)
  }

  def upsertFromRecord(record: UsageRecord)(implicit logMarker: LogMarker): Observable[JsObject] = Observable.from(Future {

     val updateSpec = new UpdateItemSpec()
      .withPrimaryKey(
        hashKeyName,
        record.hashKey,
        rangeKeyName,
        record.rangeKey
      )
      .withExpressionSpec(record.toXSpec)
      .withReturnValues(ReturnValue.ALL_NEW)

    table.updateItem(updateSpec)

  })
  .onErrorResumeNext(e => {
    logger.error(logMarker, s"Dynamo update fail for $record!", e)
    Observable.error(e)
  })
  .map(asJsObject)
}
