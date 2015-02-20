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

  private def get(id: String, key: String)
         (implicit ex: ExecutionContext): Future[Item] = Future {
    table.getItem(
      new GetItemSpec()
        .withPrimaryKey(IdKey, id)
        .withAttributesToGet(key)
    )
  } flatMap { itemOrNull =>
    Option(itemOrNull) match {
      case Some(item) => Future.successful(item)
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
                (implicit ex: ExecutionContext): Future[Option[Boolean]] =
    // TODO: add Option to item as it can be null
    get(id, key).map{ item => item.get(key) match {
      case b: java.lang.Boolean => Some(b.booleanValue)
      case _ => None
    }}

  def booleanSet(id: String, key: String, value: Boolean)
                (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"SET $key = :value",
      new ValueMap().withBoolean(":value", value)
    )

  def booleanSetOrRemove(id: String, key: String, value: Boolean)
                        (implicit ex: ExecutionContext): Future[JsObject] =
    value match {
      case true  => booleanSet(id, key, value)
      case false => removeKey(id, key)
    }

  def stringSet(id: String, key: String, value: String)
                (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"SET $key = :value",
      new ValueMap().withString(":value", value)
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

  def setAdd(id: String, key: String, value: List[String])
            (implicit ex: ExecutionContext): Future[JsObject] =
    update(
      id,
      s"ADD $key :value",
      new ValueMap().withStringSet(":value", value:_*)
    )


  def jsonGet(id: String, key: String)
             (implicit ex: ExecutionContext): Future[JsValue] =
      get(id, key).map(item => Json.parse(item.getJSON(key)).as[JsObject])

  // We cannot update, so make sure you send over the WHOLE document
  def jsonAdd(id: String, key: String, value: Map[String, String])
             (implicit ex: ExecutionContext): Future[JsObject] = {


    val valueMap = new ValueMap()
    value.foreach{ case (key, value) => valueMap.withString(key, if(value == "") null else value) }
    // FIXME: Really? Dynamo accepts `null`, but not `""`? This is a well
    // moaned about issue around in the community. This guard keeps the
    // introduction of `null` fairly fenced in this Dynamo play area. `null` is
    // continual and big annoyance with AWS libs.
    // see: https://forums.aws.amazon.com/message.jspa?messageID=389032
    // see: http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DataModel.html

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
