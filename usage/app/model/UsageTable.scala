package model

import com.gu.mediaservice.lib.aws.DynamoDB
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region

import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, DeleteItemOutcome, RangeKeyCondition}
import scalaz.syntax.id._

import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import scala.collection.JavaConversions._
import scala.collection.JavaConverters._

import scala.util.Try

import org.joda.time.DateTime

import rx.lang.scala.Observable

import lib.Config

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

object UsageTable extends DynamoDB(
    Config.awsCredentials,
    Config.dynamoRegion,
    Config.usageRecordTable
  ){

  val hashKeyName = "grouping"
  val rangeKeyName = "usage_id"
  val imageIndexName = "media_id"

  def queryByUsageId(id: String): Future[Option[MediaUsage]] = Future {
    UsageTableFullKey.build(id).flatMap((tableFullKey: UsageTableFullKey) => {
      val keyAttribute = new KeyAttribute(hashKeyName, tableFullKey.hashKey)
      val rangeKeyCondition = (new RangeKeyCondition(rangeKeyName)).eq(tableFullKey.rangeKey)

      val queryResult = table.query(keyAttribute, rangeKeyCondition)

      queryResult.asScala.map(MediaUsage.build).headOption
    })
  }

  def queryByImageId(id: String): Future[Set[MediaUsage]] = Future {
    val imageIndex = table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute(imageIndexName, id)
    val queryResult = imageIndex.query(keyAttribute)

    val fullSet = queryResult.asScala.map(MediaUsage.build).toSet[MediaUsage]

    hidePendingIfPublished(
      hidePendingIfRemoved(fullSet))
  }

  def hidePendingIfRemoved(usages: Set[MediaUsage]): Set[MediaUsage] = usages.filterNot((mediaUsage: MediaUsage) => {
    mediaUsage.status.isInstanceOf[PendingUsageStatus] && mediaUsage.isRemoved
  })

  def hidePendingIfPublished(usages: Set[MediaUsage]): Set[MediaUsage] = usages.groupBy(_.grouping).flatMap {
    case (grouping, groupedUsages) => {
        val publishedUsage = groupedUsages.find(_.status match {
          case _: PublishedUsageStatus => true
          case _ => false
        })

        if (publishedUsage.isEmpty) {
            groupedUsages.headOption
        } else {
            publishedUsage
        }
      }
  }.toSet

  def matchUsageGroup(usageGroup: UsageGroup): Observable[UsageGroup] =
    Observable.from(Future {
      val status = s"${usageGroup.status}"
      val grouping = usageGroup.grouping
      val keyAttribute = new KeyAttribute("grouping", grouping)
      val queryResult = table.query(keyAttribute)

      val usages = queryResult.asScala
        .map(MediaUsage.build)
        .filter(usage => {
          s"${usage.status}" == status
        }).toSet

      UsageGroup(usages, grouping, usageGroup.status, new DateTime)
    })

  def create(mediaUsage: MediaUsage): Observable[JsObject] =
    updateFromRecord(UsageRecord.buildCreateRecord(mediaUsage))

  def update(mediaUsage: MediaUsage): Observable[JsObject] =
    updateFromRecord(UsageRecord.buildUpdateRecord(mediaUsage))

  def delete(mediaUsage: MediaUsage): Observable[JsObject] =
    updateFromRecord(UsageRecord.buildDeleteRecord(mediaUsage))

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

  }).map(asJsObject)
}
