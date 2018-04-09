package model

import com.amazonaws.services.dynamodbv2.document.spec.{DeleteItemSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, RangeKeyCondition}
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.{PendingUsageStatus, PublishedUsageStatus}
import lib.UsageConfig
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.util.Try

case class UsageTableFullKey(hashKey: String, rangeKey: String) {
  override def toString = List(
    hashKey,
    rangeKey
  ).mkString(UsageTableFullKey.keyDelimiter)
}
object UsageTableFullKey {
  val keyDelimiter = "_"

  def build(mediaUsage: MediaUsage): UsageTableFullKey = {
    UsageTableFullKey(mediaUsage.grouping, mediaUsage.usageId.toString)
  }

  def build(combinedKey: String): Option[UsageTableFullKey] = {
    val pair = combinedKey.split(keyDelimiter)

    Try { pair match { case Array(h,r) => UsageTableFullKey(h, r) } }.toOption
  }
}

class UsageTable(config: UsageConfig, mediaUsage: MediaUsageOps) extends DynamoDB(config, config.usageRecordTable){

  val hashKeyName = "grouping"
  val rangeKeyName = "usage_id"
  val imageIndexName = "media_id"

  def queryByUsageId(id: String): Future[Option[MediaUsage]] = Future {
    UsageTableFullKey.build(id).flatMap((tableFullKey: UsageTableFullKey) => {
      val keyAttribute: KeyAttribute = new KeyAttribute(hashKeyName, tableFullKey.hashKey)
      val rangeKeyCondition: RangeKeyCondition = new RangeKeyCondition(rangeKeyName).eq(tableFullKey.rangeKey)

      val queryResult = table.query(keyAttribute, rangeKeyCondition)

      queryResult.asScala.map(mediaUsage.build).headOption
    })
  }

  def queryByImageId(id: String): Future[Set[MediaUsage]] = Future {
    val imageIndex = table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)

    val fullSet = queryResult.asScala.map(mediaUsage.build).toSet[MediaUsage]

    hidePendingIfPublished(
      hidePendingIfRemoved(fullSet))
  }

  def hidePendingIfRemoved(usages: Set[MediaUsage]): Set[MediaUsage] = usages.filterNot((mediaUsage: MediaUsage) => {
    mediaUsage.status.isInstanceOf[PendingUsageStatus] && mediaUsage.isRemoved
  })

  def hidePendingIfPublished(usages: Set[MediaUsage]): Set[MediaUsage] = usages.groupBy(_.grouping).flatMap {
    case (grouping, groupedUsages) =>
      val publishedUsage = groupedUsages.find(_.status match {
        case _: PublishedUsageStatus => true
        case _ => false
      })

      if (publishedUsage.isEmpty) {
          groupedUsages.headOption
      } else {
          publishedUsage
      }
  }.toSet

  def matchUsageGroup(usageGroup: UsageGroup): Observable[UsageGroup] = {
    Logger.info(s"Trying to match UsageGroup: ${usageGroup.grouping}")

    Observable.from(Future {
      val status = s"${usageGroup.status}"
      val grouping = usageGroup.grouping
      val keyAttribute = new KeyAttribute("grouping", grouping)

      Logger.info(s"Querying table for $grouping - $status")
      val queryResult = table.query(keyAttribute)

      val usages = queryResult.asScala
        .map(mediaUsage.build)
        .filter(usage => {
          s"${usage.status}" == status
        }).toSet

      Logger.info(s"Built matched UsageGroup ${usageGroup.grouping} (${usages.size})")

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

    Logger.info(s"deleting usage ${mediaUsage.usageId} for media id ${mediaUsage.mediaId}")

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
    Logger.error(s"Dynamo update fail for $record!", e)
    Observable.error(e)
  })
  .map(asJsObject)
}
