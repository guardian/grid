package model

import com.gu.mediaservice.lib.aws.DynamoDB
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.document.{KeyAttribute, DeleteItemOutcome}
import scalaz.syntax.id._

import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._

import org.joda.time.DateTime

import rx.lang.scala.Observable

import lib.Config


object UsageRecordTable extends DynamoDB(
    Config.awsCredentials,
    Config.dynamoRegion,
    Config.usageRecordTable
  ){

  val hashKeyName = "grouping"
  val rangeKeyName = "usage_id"
  val imageIndexName = "media_id"

  def sanitiseMultilineString(s: String) = s.stripMargin.replaceAll("\n", " ")

  def queryByImageId(id: String): Future[Set[MediaUsage]] = Future {
    val imageIndex = table.getIndex(imageIndexName)
    val keyAttribute = new KeyAttribute("media_id", id)
    val queryResult = imageIndex.query(keyAttribute)

    queryResult.asScala.map(MediaUsage.build(_)).toSet[MediaUsage]
  }

  def matchUsageGroup(usageGroup: UsageGroup): Observable[UsageGroup] =
    Observable.from(Future {
      val status = s"${usageGroup.status}"
      val grouping = usageGroup.grouping

      val keyAttribute = new KeyAttribute("grouping", grouping)
      val queryResult = table.query(keyAttribute)

      val usages = queryResult.asScala
        .map(MediaUsage.build(_))
        .filter(usage => {
          s"${usage.status}" == status
        }).toSet

      UsageGroup(usages, grouping, usageGroup.status, new DateTime)
    })

  def delete(hashKey: String, rangeKey: String): Observable[JsObject] = Observable.from(Future {
    table.deleteItem(hashKeyName, hashKey, rangeKeyName, rangeKey)
  }).map(asJsObject)

  def update(mediaUsage: MediaUsage): Observable[JsObject] = Observable.from(Future {
    val expression = sanitiseMultilineString(
      s"""SET media_id = :media_id,
             |usage_type = :usage_type,
             |media_type = :media_type,
             |last_modified = :last_modified,
             |data_map = :data_map,
             |usage_status = :usage_status"""
    )

    val baseUpdateSpec = new UpdateItemSpec()
      .withPrimaryKey(
        hashKeyName,
        mediaUsage.grouping,
        rangeKeyName,
        mediaUsage.usageId
      )
      .withUpdateExpression(expression)
      .withReturnValues(ReturnValue.ALL_NEW)

    val valueMap = (new ValueMap()) <| (vMap => {
      vMap.withString(":media_id", mediaUsage.mediaId)
      vMap.withString(":usage_type", mediaUsage.usageType)
      vMap.withString(":media_type", mediaUsage.mediaType)
      vMap.withString(":usage_status", mediaUsage.status.toString)
      vMap.withMap(":data_map", mediaUsage.data.asJava)
      vMap.withLong(":last_modified", mediaUsage.lastModified.getMillis)
    })

    val updateSpec = baseUpdateSpec.withValueMap(valueMap)
    table.updateItem(updateSpec)

  }).map(asJsObject)
}
