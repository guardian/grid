package com.gu.mediaservice.lib.aws

import java.util
import com.amazonaws.AmazonServiceException
import com.amazonaws.services.dynamodbv2.document.spec.{DeleteItemSpec, GetItemSpec, PutItemSpec, QuerySpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.document.{DynamoDB => AwsDynamoDB, _}
import com.amazonaws.services.dynamodbv2.model.{AttributeValue, DeleteItemRequest, KeysAndAttributes, ReturnValue}
import com.amazonaws.services.dynamodbv2.{AmazonDynamoDBAsync, AmazonDynamoDBAsyncClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.DateTime
import play.api.libs.json._
import software.amazon.awssdk.enhanced.dynamodb._
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.enhanced.dynamodb.model
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.{UpdateItemRequest, AttributeValue => AttributeValueV2, ReturnValue => ReturnValueV2}

import scala.annotation.tailrec
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._

object NoItemFound extends Throwable("item not found")

/**
  * A lightweight wrapper around AWS dynamo SDK for undertaking various operations
  * @param config Common grid config including AWS credentials
  * @param tableName the table name for this instance of the dynamoDB wrapper
  * @param lastModifiedKey if set to a string the wrapper will maintain a last modified with that name on any update
  * @tparam T The type of this table
  */
class DynamoDB[T](config: CommonConfig, tableName: String, lastModifiedKey: Option[String] = None) extends GridLogging {
  lazy val client2: DynamoDbClient = config.withAWSCredentialsV2(DynamoDbClient.builder()).build()
  lazy val dynamo2: DynamoDbEnhancedClient = DynamoDbEnhancedClient.builder().dynamoDbClient(client2).build()
  lazy val tableSchema = TableSchema.documentSchemaBuilder()
    .addIndexPartitionKey(TableMetadata.primaryIndexName(), IdKey, AttributeValueType.S)
    .attributeConverterProviders(AttributeConverterProvider.defaultProvider())
    .build()
  lazy val table2 = dynamo2.table(tableName, tableSchema)

  lazy val client: AmazonDynamoDBAsync = config.withAWSCredentials(AmazonDynamoDBAsyncClientBuilder.standard()).build()
  lazy val dynamo = new AwsDynamoDB(client)
  lazy val table: Table = dynamo.getTable(tableName)

  private val IdKey = "id"

  private def itemKey(key: String) = Key.builder().partitionValue(key).build()

  def getV2(id: String)(implicit ex: ExecutionContext): Future[JsObject] = Future {
    table2.getItem(itemKey(id))
  } flatMap docOrNotFound map asJsObject

  private def getV2(id: String, attribute: String)(implicit ex: ExecutionContext): Future[EnhancedDocument] = Future {
    Option(table2.getItem(itemKey(id))).flatMap(doc => Option.when(doc.isPresent(attribute))(doc))
  } flatMap {
    case Some(doc) => Future.successful(doc)
    case None => Future.failed(NoItemFound)
  }

  private def docOrNotFound(docOrNull: EnhancedDocument): Future[EnhancedDocument] = {
    Option(docOrNull) match {
      case Some(doc) => Future.successful(doc)
      case None       => Future.failed(NoItemFound)
    }
  }

  def removeKeyV2(id: String, key: String)(implicit ex: ExecutionContext) = Future{
    updateV2(id, s"Remove $key")
  }
  def deleteItem(id: String)(implicit ex: ExecutionContext): Future[Unit] = Future {
    table.deleteItem(new DeleteItemSpec().withPrimaryKey(IdKey, id))
  }

  def deleteItemV2(id: String)(implicit ex: ExecutionContext): Future[Unit] = Future {
    table2.deleteItem(
      Key.builder().partitionValue(id).build()
    )
  }
  def booleanGetV2(id: String, key: String)
    (implicit ex: ExecutionContext): Future[Boolean] = {
      getV2(id, key).map(_.getBoolean(key).booleanValue())
  }

  def booleanSetV2(id: String, key: String, value: Boolean)
                (implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(
      id,
      s"SET $key = :value",
      AttributeValueV2.fromBool(value)
    )
  }

  def booleanSetOrRemoveV2(id: String, key: String, value: Boolean)
                        (implicit ex: ExecutionContext): Future[JsObject] =
    if (value) booleanSetV2(id, key, value)
    else removeKeyV2(id, key)

  def stringSetV2(id: String, key: String, value: String)(implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(id, s"SET $key = :value", AttributeValueV2.fromS(value))
  }

  def setGetV2(id: String, key: String)
    (implicit ex: ExecutionContext): Future[Set[String]] = {
      getV2(id, key).map(_.getStringSet(key).asScala.toSet)
  }

  def setAddV2(id: String, key: String, value: List[String])(implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(id, s"ADD $key :value", AttributeValueV2.fromSs(value.asJava))
  }
  def batchGet(ids: List[String], attributeKey: String)
              (implicit ex: ExecutionContext, rjs: Reads[T]): Future[Map[String, T]] = {
    val keyChunkList = ids
      .map(k => Map(IdKey -> new AttributeValue(k)).asJava)
      .grouped(100)

    Future.traverse(keyChunkList) { keyChunk => {
      val keysAndAttributes: KeysAndAttributes = new KeysAndAttributes().withKeys(keyChunk.asJava)

      @tailrec
      def nextPageOfBatch(request: java.util.Map[String, KeysAndAttributes], acc: List[(String, T)])
                         (implicit ex: ExecutionContext, rjs: Reads[T]): List[(String, T)] = {
        if (request.isEmpty) acc
        else {
          logger.info(s"Fetching records for $request")
          val response = client.batchGetItem(request)
          val responses = response.getResponses
          logger.info(s"Got responses of $responses")
          val results = responses.get(tableName).asScala.toList
            .flatMap(att => {
              val attributes: util.Map[String, AnyRef] = ItemUtils.toSimpleMapValue(att)
              logger.info(s"Obtained attributes of $attributes from response $att")
              val json = asJsObject(Item.fromMap(attributes))
              val maybeT = (json \ attributeKey).asOpt[T]
              logger.info(s"Obtained a T of $maybeT from json $json")
              maybeT.map(
                attributes.get(IdKey).toString -> _
              )
            })
          logger.info(s"Got $results for request")
          nextPageOfBatch(response.getUnprocessedKeys, acc ::: results)
        }
      }

      Future {
        nextPageOfBatch(Map(tableName -> keysAndAttributes).asJava, Nil).toMap
      }
    }}
      .map(chunkIterator => chunkIterator.fold(Map.empty)((acc, result) => acc ++ result))
  }

  def jsonAddV2(id: String, key: String, value: Map[String, JsValue])
             (implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(
      id,
      s"SET $key = :value",
      AttributeValueV2.fromM(value.view.mapValues(DynamoDB.jsonToAttributeValue).toMap.asJava)
    )
  }

  def setDeleteV2(id: String, key: String, value: String)
               (implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(id, s"DELETE $key :value", AttributeValueV2.fromSs(List(value).asJava))
  }


  def scanForId(indexName: String, keyname: String, key: String)(implicit ex: ExecutionContext) = Future {
    val index = table.getIndex(indexName)

    val spec = new QuerySpec()
      .withKeyConditionExpression(s"$keyname = :key")
      .withValueMap(new ValueMap()
        .withString(":key", key))

    val items: List[Item] = index.query(spec).iterator.asScala.toList
    items map (a => a.getString("id"))
  }

  private def updateRequestBuilder(id: String, expression: String) = {
    UpdateItemRequest.builder()
      .key(Map(IdKey -> AttributeValueV2.fromS(id)).asJava)
      .updateExpression(expression)
      .returnValues(ReturnValueV2.ALL_NEW)
      .tableName(tableName)
  }

  def updateV2(id: String, expression: String, attribute: AttributeValueV2) = {
    val updateRequest = updateRequestBuilder(id, expression)
      .expressionAttributeValues(Map(":value" -> attribute).asJava)
      .build()
    val updateItemResponse = client2.updateItem(updateRequest)
    val jsonString = EnhancedDocument.fromAttributeValueMap(updateItemResponse.attributes()).toJson
    Json.parse(jsonString).as[JsObject]
  }

  def updateV2(id: String, expression: String) = {
    val updateRequest = updateRequestBuilder(id, expression).build()
    val updateItemResponse = client2.updateItem(updateRequest)
    val jsonString = EnhancedDocument.fromAttributeValueMap(updateItemResponse.attributes()).toJson
    Json.parse(jsonString).as[JsObject]
  }

  // FIXME: surely there must be a better way to convert?
  def asJsObject(item: Item): JsObject =
    jsonWithNullAsEmptyString(Json.parse(item.toJSON)).as[JsObject] - IdKey

  def asJsObject(doc: EnhancedDocument): JsObject =
    jsonWithNullAsEmptyString(Json.parse(doc.toJson)).as[JsObject] - IdKey

  def asJsObject(outcome: UpdateItemOutcome): JsObject =
    Option(outcome.getItem) map asJsObject getOrElse Json.obj()

  // FIXME: Dynamo accepts `null`, but not `""`. This is a well documented issue
  // around the community. This guard keeps the introduction of `null` fairly
  // fenced in this Dynamo play area. `null` is continual and big annoyance with AWS libs.
  // see: https://forums.aws.amazon.com/message.jspa?messageID=389032
  // see: http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DataModel.html
  def mapJsValue(jsValue: JsValue)(f: JsValue => JsValue): JsValue = jsValue match {
    case JsObject(items) => JsObject(items.map{ case (k, v) => k -> mapJsValue(v)(f) })
    case JsArray(items) => JsArray(items.map(f))
    case value => f(value)
  }

  def jsonWithNullAsEmptyString(jsValue: JsValue): JsValue = mapJsValue(jsValue) {
    case JsNull => JsString("")
    case value => value
  }

}

object DynamoDB {
  def jsonToValueMap(json: JsObject): ValueMap = {
    val valueMap = new ValueMap()
    json.value map { case (key, value) =>
      value match {
        case v: JsString  => valueMap.withString(key, v.value)
        case v: JsBoolean => valueMap.withBoolean(key, v.value)
        case v: JsNumber  => valueMap.withNumber(key, v.value)
        case v: JsObject  => valueMap.withMap(key, jsonToValueMap(v))

        // TODO: Lists of different Types? JsArray is not type safe (because json lists aren't)
        // so this leaves us in a bit of a pickle when converting them. So for now we only support
        // List[String]
        case v: JsArray   => valueMap.withList(key, v.value.map {
          case i: JsString => i.value
          case i: JsValue => i.toString
        }.asJava)
        case _ => valueMap
      }
    }
    valueMap
  }

  def jsonToAttributeValue(json: JsValue): AttributeValueV2 = {
    json match {
      case JsString(v)  => AttributeValueV2.fromS(v)
      case JsBoolean(b) => AttributeValueV2.fromBool(b)
      case JsTrue => AttributeValueV2.fromBool(true)
      case JsFalse => AttributeValueV2.fromBool(false)
      case JsNumber(n)  => AttributeValueV2.fromN(n.toString())
      case JsNull => AttributeValueV2.fromNul(true)
      case JsObject(obj)  => AttributeValueV2.fromM(obj.view.mapValues(s => jsonToAttributeValue(s)).toMap.asJava)
      case JsArray(arr)   => AttributeValueV2.fromL(arr.toList.map(jsonToAttributeValue).asJava)
    }
  }

  def caseClassToMap[T](caseClass: T)(implicit tjs: Writes[T]): Map[String, JsValue] =
    Json.toJson[T](caseClass).as[JsObject].as[Map[String, JsValue]]

  def addLastModifiedUpdate(update: UpdateItemSpec, lastModifiedKey: String, lastModifiedDate: DateTime): UpdateItemSpec = {
    val expression = update.getUpdateExpression
    val valueMap: ValueMap = {
      val m = new ValueMap()
      Option(update.getValueMap).foreach { vm =>
        m.putAll(vm)
      }
      m
    }

    val newExpression = {
      val keyUpdate: String = s"$lastModifiedKey = :$lastModifiedKey"
      if (expression.contains("SET ")) {
          // add to existing clause
        expression.replace("SET ", s"SET ${keyUpdate}, ")
      } else {
        // add SET clause to existing expression
        s"SET $keyUpdate ${expression}"
      }
    }

    valueMap.put(s":$lastModifiedKey", lastModifiedDate.toString)

    update
      .withUpdateExpression(newExpression)
      .withValueMap(valueMap)
  }
}
