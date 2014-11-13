package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.{DynamoDB => AwsDynamoDB, UpdateItemOutcome, Table, Item}
import com.amazonaws.services.dynamodbv2.document.spec.{GetItemSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.model.ReturnValue
import play.api.libs.json.{JsValue, JsObject, Json}

import scala.concurrent.{ExecutionContext, Future}
import scalaz.syntax.id._
import scala.collection.JavaConverters._

object NoItemFound extends Throwable("item not found")

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
  } flatMap { itemOrNull =>
    // TODO: port this logic to update and other places where item may be null?
    Option(itemOrNull) match {
      case Some(item) => Future.successful(asJsObject(item))
      case None       => Future.failed(NoItemFound)
    }
  }

  def removeKey(id: String, key: String)
               (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"REMOVE $key"
    )


  def booleanGet(id: String, key: String)
                (implicit ex: ExecutionContext): Future[Boolean] =
    get(id, key).map(_.getBoolean(key))

  def booleanSet(id: String, key: String, value: Boolean)
                (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"SET $key = :value",
      new ValueMap().withBoolean(":value", value)
    )


  def setGet(id: String, key: String)
            (implicit ex: ExecutionContext): Future[Set[String]] =
    get(id, key).map(_.getStringSet(key).asScala.toSet)

  def setAdd(id: String, key: String, value: String)
            (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"ADD $key :value",
      new ValueMap().withStringSet(":value", value)
    )


  def jsonGet(id: String, key: String)
             (implicit ex: ExecutionContext): Future[JsValue] =
      get(id, key).map{item => Json.parse(item.getJSON(key)).as[JsObject]}

  // We cannot update, so make sure you send over the WHOLE document
  def jsonAdd(id: String, key: String, value: Map[String, String])
             (implicit ex: ExecutionContext): Future[JsObject] = {

    val valueMap = new ValueMap()
    value.foreach{ case (key, value) => valueMap.withString(key, value) }

    update(
      id,
      s"SET $key = :value",
        new ValueMap().withMap(":value", valueMap)
    )
  }

  def setDelete(id: String, key: String, value: String)
               (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"DELETE $key :value",
      new ValueMap().withStringSet(":value", value)
    )


  def get(id: String, key: String)
         (implicit ex: ExecutionContext): Future[Item] = Future {
    table.getItem(
      new GetItemSpec()
        .withPrimaryKey(IdKey, id)
        .withAttributesToGet(key)
    )
  }

  def update(id: String, expression: String, valueMap: ValueMap)
            (implicit ex: ExecutionContext): Future[JsObject] =
    update(id, expression, Some(valueMap))

  def update(id: String, expression: String, valueMap: Option[ValueMap] = None)
            (implicit ex: ExecutionContext): Future[JsObject] = Future {
    val baseUpdateSpec = new UpdateItemSpec().
      withPrimaryKey(IdKey, id).
      withUpdateExpression(expression).
      withReturnValues(ReturnValue.ALL_NEW)

    val updateSpec = valueMap.map(baseUpdateSpec.withValueMap(_)) getOrElse baseUpdateSpec

    table.updateItem(updateSpec)
  } map asJsObject


  // FIXME: surely there must be a better way to convert?
  def asJsObject(item: Item): JsObject =
    Json.parse(item.toJSON).as[JsObject] - IdKey

  def asJsObject(outcome: UpdateItemOutcome): JsObject =
    asJsObject(outcome.getItem)

}
