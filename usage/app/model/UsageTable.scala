package model

import com.amazonaws.services.dynamodbv2.document.spec.{DeleteItemSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, RangeKeyCondition}
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.usage.ItemToMediaUsage
import com.gu.mediaservice.model.usage.{MediaUsage, PendingUsageStatus, PublishedUsageStatus, UsageTableFullKey}
import lib.{BadInputException, UsageConfig}
import org.joda.time.DateTime
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.util.Try

class UsageTable(config: UsageConfig) extends DynamoDB(config, config.usageRecordTable) with GridLogging {

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

  def queryByImageId(id: String): Future[Set[MediaUsage]] = Future {

    if (id.trim.isEmpty)
      throw new BadInputException("Empty string received for image id")

    val imageIndex = table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)

    val fullSet = queryResult.asScala.map(ItemToMediaUsage.transform).toSet[MediaUsage]

    hidePendingIfPublished(
      hidePendingIfRemoved(fullSet))
  }

  def hidePendingIfRemoved(usages: Set[MediaUsage]): Set[MediaUsage] = usages.filterNot((mediaUsage: MediaUsage) => {
    mediaUsage.status match {
      case PendingUsageStatus => mediaUsage.isRemoved
      case _ => false
    }
  })

  def hidePendingIfPublished(usages: Set[MediaUsage]): Set[MediaUsage] = usages.groupBy(_.grouping).flatMap {
    case (grouping, groupedUsages) =>
      val publishedUsage = groupedUsages.find(_.status match {
        case PublishedUsageStatus => true
        case _ => false
      })

      if (publishedUsage.isEmpty) {
          groupedUsages.headOption
      } else {
          publishedUsage
      }
  }.toSet

  def matchUsageGroup(usageGroup: UsageGroup): Observable[UsageGroup] = {
    logger.info(s"Trying to match UsageGroup: ${usageGroup.grouping}")

    Observable.from(Future {
      val status = usageGroup.status
      val grouping = usageGroup.grouping
      val keyAttribute = new KeyAttribute("grouping", grouping)

      logger.info(s"Querying table for $grouping - $status")
      val queryResult = table.query(keyAttribute)

      val usages = queryResult.asScala
        .map(ItemToMediaUsage.transform)
        .filter(_.status == status)
        .toSet

      logger.info(s"Built matched UsageGroup ${usageGroup.grouping} (${usages.size})")

      UsageGroup(usages, grouping, usageGroup.status, new DateTime)
    })
  }

  def create(mediaUsage: MediaUsage): Observable[JsObject] =
    updateFromRecord(UsageRecord.buildCreateRecord(mediaUsage))

  def update(mediaUsage: MediaUsage): Observable[JsObject] =
    updateFromRecord(UsageRecord.buildUpdateRecord(mediaUsage))

  def delete(mediaUsage: MediaUsage): Observable[JsObject] =
    updateFromRecord(UsageRecord.buildDeleteRecord(mediaUsage))

  def deleteRecord(mediaUsage: MediaUsage) = {
    val record = UsageRecord.buildDeleteRecord(mediaUsage)

    logger.info(s"deleting usage ${mediaUsage.usageId} for media id ${mediaUsage.mediaId}")

    val deleteSpec = new DeleteItemSpec()
      .withPrimaryKey(
        hashKeyName,
        record.hashKey,
        rangeKeyName,
        record.rangeKey
      )

    table.deleteItem(deleteSpec)
  }

  def updateFromRecord(record: UsageRecord): Observable[JsObject] = Observable.from(Future {

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
    logger.error(s"Dynamo update fail for $record!", e)
    Observable.error(e)
  })
  .map(asJsObject)
}
