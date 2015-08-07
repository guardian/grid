package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.sns.{AmazonSNSClient, AmazonSNS}
import com.amazonaws.services.sns.model.PublishRequest
import play.api.Logger
import play.api.libs.json.{Writes, Json, JsValue}
import scala.util.Try
import scalaz.syntax.id._


class SNS(credentials: AWSCredentials, topicArn: String) {

  val snsEndpoint = "sns.eu-west-1.amazonaws.com"

  lazy val client: AmazonSNS =
    new AmazonSNSClient(credentials) <| (_ setEndpoint snsEndpoint)

  def publish(message: JsValue, subject: String) {
    val result = client.publish(new PublishRequest(topicArn, Json.stringify(message), subject))
    Logger.info(s"Published message: $result")
  }

  def publish[T](id: String, obj: T, subject: String)(implicit tjs: Writes[T]): Option[T] = {
    val jsonOpt = Try(Json.toJson(obj)).toOption

    jsonOpt.map(json => {
      publish(message(id, json), subject)
      obj
    })
  }

  def message(id: String, data: JsValue) = Json.obj("id" -> id, "data" -> data)

}
