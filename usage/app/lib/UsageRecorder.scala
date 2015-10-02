package lib

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region

import com.amazonaws.services.dynamodbv2.document.spec.UpdateItemSpec
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap

import com.gu.mediaservice.lib.aws.DynamoDB

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.{ExecutionContext, Future}

import rx.lang.scala.Observable

import play.api.libs.json._
import model._


case class UsageRecord(
  usageId: String,
  grouping: String,
  imageId: String
)

object UsageRecord {

  def fromMediaUsage(mediaUsage: MediaUsage) =
    UsageRecord(
      mediaUsage.usageId,
      mediaUsage.grouping,
      mediaUsage.image.id
    )
}

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
      s"""SET image_id = :image_id"""
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

    val valueMap = new ValueMap()

    valueMap.withString(":image_id", usageRecord.imageId)

    val updateSpec = baseUpdateSpec.withValueMap(valueMap)

    table.updateItem(updateSpec)

  }).map(asJsObject)
}

object UsageRecorder {
  val usageStream = UsageStream.observable

  val observable = usageStream.flatMap((usageGroup: UsageGroup) => {

    Observable.from(usageGroup.usages.map(mediaUsage => {
      UsageRecordTable.update(UsageRecord.fromMediaUsage(mediaUsage))
    })).flatten
  })
}
