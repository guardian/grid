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
      s"""SET image_id = :image_id,
             |usage_type = :usage_type"""
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
      vMap.withString(":image_id", usageRecord.imageId)
      vMap.withString(":usage_type", usageRecord.usageType)
    })

    val updateSpec = baseUpdateSpec.withValueMap(valueMap)
    table.updateItem(updateSpec)

  }).map(asJsObject)
}
