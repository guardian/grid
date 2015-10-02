package model

import com.gu.mediaservice.lib.aws.DynamoDB
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap

import scalaz.syntax.id._

import play.api.libs.json._

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

  def update(usageRecord: UsageRecord): Observable[JsObject] = Observable.from(Future {
    val expression = sanitiseMultilineString(
      s"""SET media_id = :media_id,
             |usage_type = :usage_type,
             |media_type = :media_type,
             |usage_status = :usage_status"""
    )

    val baseUpdateSpec = new UpdateItemSpec()
      .withPrimaryKey(
        hashKeyName,
        usageRecord.grouping,
        rangeKeyName,
        usageRecord.usageId
      )
      .withUpdateExpression(expression)
      .withReturnValues(ReturnValue.ALL_NEW)

    val valueMap = (new ValueMap()) <| (vMap => {
      vMap.withString(":media_id", usageRecord.mediaId)
      vMap.withString(":usage_type", usageRecord.usageType)
      vMap.withString(":media_type", usageRecord.mediaType)
      vMap.withString(":usage_status", usageRecord.status)
    })

    val updateSpec = baseUpdateSpec.withValueMap(valueMap)
    table.updateItem(updateSpec)

  }).map(asJsObject)
}
