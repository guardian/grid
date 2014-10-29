package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.{DynamoDB => AwsDynamoDB, UpdateItemOutcome, Table, Item}
import com.amazonaws.services.dynamodbv2.document.spec.{GetItemSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import play.api.libs.json.{JsObject, Json}

import scala.concurrent.{ExecutionContext, Future}
import scalaz.syntax.id._
import scala.collection.JavaConverters._

class DynamoDB(credentials: AWSCredentials, region: Region, tableName: String) {

  lazy val client: AmazonDynamoDBClient =
    new AmazonDynamoDBClient(credentials) <| (_ setRegion region)

  lazy val dynamo = new AwsDynamoDB(client)
  lazy val table: Table = dynamo.getTable(tableName)

  val IdKey = "id"


  def get(id: String)
         (implicit ex: ExecutionContext): Future[JsObject] = Future {
    table.getItem(
      new GetItemSpec().
        withPrimaryKey(IdKey, id)
    )
  } map asJsObject

  def removeKey(id: String, key: String)
               (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"REMOVE $key"
    )


  def booleanGet(id: String, key: String)
                (implicit ex: ExecutionContext): Future[Boolean] = Future {
    table.getItem(
      new GetItemSpec().
        withPrimaryKey(IdKey, id).
        withAttributesToGet(key)
    )
  } map { _.getBoolean(key) }

  def booleanSet(id: String, key: String, value: Boolean)
                (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"SET $key = :value",
      new ValueMap().withBoolean(":value", value)
    )


  def setGet(id: String, key: String)
            (implicit ex: ExecutionContext): Future[Set[String]] = Future {
    table.getItem(
      new GetItemSpec().
        withPrimaryKey(IdKey, id).
        withAttributesToGet(key)
    )
  } map { _.getStringSet(key).asScala.toSet }

  def setAdd(id: String, key: String, value: String)
            (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"ADD $key :value",
      new ValueMap().withStringSet(":value", value)
    )

  def setDelete(id: String, key: String, value: String)
               (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"DELETE $key :value",
      new ValueMap().withStringSet(":value", value)
    )

  def update(id: String, expression: String, valueMap: ValueMap = new ValueMap())
            (implicit ex: ExecutionContext): Future[JsObject] = Future {
    table.updateItem(
      new UpdateItemSpec().
        withPrimaryKey(IdKey, id).
        withUpdateExpression(expression).
        withValueMap(valueMap).
        withReturnValues(ReturnValue.ALL_NEW)
    )
  } map asJsObject


  // FIXME: surely there must be a better way to convert?
  def asJsObject(item: Item): JsObject =
    Json.parse(item.toJSON).as[JsObject] - IdKey

  def asJsObject(outcome: UpdateItemOutcome): JsObject =
    asJsObject(outcome.getItem)

}
