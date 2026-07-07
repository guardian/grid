package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.aws.DynamoDB.{deleteExpr, jsonWithNullAsEmptyString, setExpr}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.DateTime
import play.api.libs.json._
import software.amazon.awssdk.enhanced.dynamodb._
import software.amazon.awssdk.enhanced.dynamodb.document.EnhancedDocument
import software.amazon.awssdk.enhanced.dynamodb.model.{BatchGetItemEnhancedRequest, ReadBatch}
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.{UpdateItemRequest, AttributeValue => AttributeValueV2, QueryRequest => QueryRequestV2, ReturnValue => ReturnValueV2}

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
    updateV2(id, DynamoDB.removeExpr(key, lastModifiedKey))
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
      DynamoDB.setExpr(key, lastModifiedKey),
      AttributeValueV2.fromBool(value)
    )
  }

  def booleanSetOrRemoveV2(id: String, key: String, value: Boolean)
                        (implicit ex: ExecutionContext): Future[JsObject] =
    if (value) booleanSetV2(id, key, value)
    else removeKeyV2(id, key)

  def stringSetV2(id: String, key: String, value: String)(implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(id,  DynamoDB.setExpr(key, lastModifiedKey), AttributeValueV2.fromS(value))
  }

  def setGetV2(id: String, key: String)
    (implicit ex: ExecutionContext): Future[Set[String]] = {
    getV2(id, key).map(_.getStringSet(key).asScala.toSet)
  }

  def setAddV2(id: String, key: String, value: List[String])(implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(id, DynamoDB.addExpr(key, lastModifiedKey), AttributeValueV2.fromSs(value.asJava))
  }

  def batchGetV2(ids: List[String], attributeKey: String)(implicit ex: ExecutionContext, rjs: Reads[T]): Future[Map[String, T]] = {
    val chunks =
      ids.grouped(100).toList.zipWithIndex

    Future
      .traverse(chunks) { case (chunk, idx) =>
        logger.info(s"Fetching records for chunk $idx of ${chunks.size}")
        Future {

          val readBatchBuilder =
            ReadBatch.builder(classOf[EnhancedDocument])
              .mappedTableResource(table2)

          chunk.foreach { id =>
            readBatchBuilder.addGetItem(
              Key.builder()
                .partitionValue(id)
                .build()
            )
          }

          val results =
            dynamo2.batchGetItem(
              BatchGetItemEnhancedRequest.builder()
                .readBatches(readBatchBuilder.build())
                .build()
            )

          results
            .resultsForTable(table2)
            .asScala
            .toList
            .flatMap { doc =>

              logger.info(s"Obtained document $doc")

              val json = asJsObject(doc)

              val maybeT =
                (json \ attributeKey).asOpt[T]

              logger.info(s"Obtained a T of $maybeT from json $json")

              maybeT.map(
                doc.getString(IdKey) -> _
              )
            }
            .toMap
        }
      }
      .map(_.foldLeft(Map.empty[String, T])(_ ++ _))
  }

  // We cannot update, so make sure you send over the WHOLE document
  def jsonAddV2(id: String, key: String, value: Map[String, JsValue])
             (implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(
      id,
      setExpr(key, lastModifiedKey),
      AttributeValueV2.fromM(value.view.mapValues(DynamoDB.jsonToAttributeValue).toMap.asJava)
    )
  }

  def setDeleteV2(id: String, key: String, value: String)
               (implicit ex: ExecutionContext): Future[JsObject] = Future {
    updateV2(id,  deleteExpr(key, lastModifiedKey), AttributeValueV2.fromSs(List(value).asJava))
  }

  def scanForIdV2(
                 indexName: String,
                 keyName: String,
                 key: String
               )(implicit ex: ExecutionContext): Future[List[String]] =
    Future {

      val response =
        client2.query(
          QueryRequestV2.builder()
            .tableName(tableName)
            .indexName(indexName)
            .keyConditionExpression(s"$keyName = :key")
            .expressionAttributeValues(
              Map(
                ":key" ->
                  AttributeValueV2.builder()
                    .s(key)
                    .build()
              ).asJava
            )
            .projectionExpression("id")
            .build()
        )

      response.items().asScala.toList.map { item =>
        item.get("id").s()
      }
    }

  private def updateRequestBuilder(id: String, expression: String) = {
    UpdateItemRequest.builder()
      .key(Map(IdKey -> AttributeValueV2.fromS(id)).asJava)
      .updateExpression(expression)
      .returnValues(ReturnValueV2.ALL_NEW)
      .tableName(tableName)
  }

  def updateV2(id: String, expression: String, attribute: AttributeValueV2): JsObject = {
    updateV2(id, expression, Map(":value" -> attribute))
  }

  def updateV2(id: String, expression: String): JsObject = {
    updateV2(id, expression, Map.empty[String, AttributeValueV2])
  }

  private def updateV2(id: String, expression: String, baseValuesMap: Map[String, AttributeValueV2]) = {
    val valuesMap = lastModifiedKey.fold(baseValuesMap)(key => baseValuesMap ++ Map(s":${key}" -> AttributeValueV2.fromS(DateTime.now().toString)))
    val updateRequest = updateRequestBuilder(id, expression)
      .expressionAttributeValues(valuesMap.asJava)
      .build()
    val updateItemResponse = client2.updateItem(updateRequest)
    val jsonString = EnhancedDocument.fromAttributeValueMap(updateItemResponse.attributes()).toJson
    Json.parse(jsonString).as[JsObject]
  }

  def asJsObject(doc: EnhancedDocument): JsObject =
    jsonWithNullAsEmptyString(Json.parse(doc.toJson)).as[JsObject] - IdKey

}

object DynamoDB {

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

  def setExpr[T](key: String, lastModifiedKey: Option[String]) = {
    val baseExpression = s"SET $key = :value"
    lastModifiedKey.fold(baseExpression)(lastModifiedKey => s"$baseExpression, $lastModifiedKey = :$lastModifiedKey")
  }

  def removeExpr(key: String, lastModifiedKey: Option[String]) = {
    generateExpression(s"REMOVE $key", lastModifiedKey)
  }

  def addExpr(key: String, lastModifiedKey: Option[String]) = {
    generateExpression(s"ADD $key :value", lastModifiedKey)
  }

  def deleteExpr(key: String, lastModifiedKey: Option[String]) = {
    generateExpression(s"DELETE $key :value", lastModifiedKey)
  }

  def generateExpression(baseExpression: String, lastModifiedKey: Option[String]) = {
    lastModifiedKey.fold(baseExpression)(lastModifiedKey => s"$baseExpression SET $lastModifiedKey = :$lastModifiedKey")
  }

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


  def avToAny(av: AttributeValueV2): Any =
    if (av.s() != null) av.s()
    else if (av.n() != null) av.n()
    else if (av.bool() != null) av.bool()
    else if (av.m() != null) av.m().asScala.view.mapValues(avToAny).toMap
    else if (av.l() != null) av.l().asScala.map(avToAny)
    else null
}
