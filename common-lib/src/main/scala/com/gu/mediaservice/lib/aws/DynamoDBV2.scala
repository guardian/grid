package com.gu.mediaservice.lib.aws

import com.amazonaws.services.dynamodbv2.document.Item
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.libs.json.{JsArray, JsBoolean, JsNull, JsNumber, JsObject, JsString, JsValue}
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient
import software.amazon.awssdk.services.dynamodb.model.{AttributeValue, GetItemRequest}

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.{CollectionHasAsScala, MapHasAsJava, MapHasAsScala, SeqHasAsJava}
import scala.jdk.FutureConverters._

class DynamoDBV2(config: CommonConfig, tableName: String){
  lazy val client: DynamoDbAsyncClient = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  val IdKey = "id"
  def get(id: String, path: String)(implicit ex: ExecutionContext): Future[JsValue] = {
    val key = Map("id" -> AttributeValue.builder().s(id).build()).asJava

    val response = client.getItem(GetItemRequest.builder().tableName(tableName).key(key).build())
    response.asScala.map(_.item().get(path)).map(attrToJsValue)
  }

  def attrToJsValue(attr: AttributeValue): JsValue = {
    if (attr.s() != null) {
      JsString(attr.s())
    }
    else if (attr.n() != null) JsNumber(BigDecimal(attr.n()))
    else if (attr.bool() != null) JsBoolean(attr.bool())
    else if (attr.m() != Map.empty.asJava) {
      JsObject(attr.m().asScala.view.mapValues(attrToJsValue).toMap)
    }
    else if (attr.l() != List.empty.asJava) {
      JsArray(attr.l().asScala.map(attrToJsValue).toSeq)
    }
    else JsNull
  }

  private def itemOrNotFound(itemOrNull: Item): Future[Item] = {
    Option(itemOrNull) match {
      case Some(item) => Future.successful(item)
      case None       => Future.failed(NoItemFound)
    }
  }
}
