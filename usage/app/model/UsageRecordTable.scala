package model

import com.gu.mediaservice.lib.aws.DynamoDB
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.document.KeyAttribute
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

  def sanitiseMultilineString(s: String) = s.stripMargin.replaceAll("\n", " ")

  def getUsageGroup(grouping: String): Observable[UsageGroup] =
    Observable.from(Future {
      val keyAttribute = new KeyAttribute("grouping", grouping)
      val queryResult = table.query(keyAttribute)

      val usages = queryResult.asScala.map(MediaUsage.build(_)).toSet

      UsageGroup(usages, grouping, PendingUsageStatus(new DateTime()))
    })

  def update(mediaUsage: MediaUsage): Observable[JsObject] = Observable.from(Future {
    val expression = sanitiseMultilineString(
      s"""SET media_id = :media_id,
             |usage_type = :usage_type,
             |media_type = :media_type,
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
      vMap.withString(":media_id", mediaUsage.usageDetails.id)
      vMap.withString(":usage_type", mediaUsage.usageDetails.usageType)
      vMap.withString(":media_type", mediaUsage.usageDetails.mediaType)
      vMap.withString(":usage_status", mediaUsage.usageDetails.status.toString)
    })

    val updateSpec = baseUpdateSpec.withValueMap(valueMap)
    table.updateItem(updateSpec)

  }).map(asJsObject)
}
