package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.sns.{AmazonSNSClient, AmazonSNS}
import com.amazonaws.services.sns.model.PublishRequest
import play.api.Logger
import play.api.libs.json.{Json, JsValue}
import scalaz.syntax.id._


class SNS(credentials: AWSCredentials, topicArn: String) {

  val snsEndpoint = "sns.eu-west-1.amazonaws.com"

  lazy val client: AmazonSNS =
    new AmazonSNSClient(credentials) <| (_ setEndpoint snsEndpoint)

  def publish(message: JsValue, subject: String) {
    val result = client.publish(new PublishRequest(topicArn, Json.stringify(message), subject))
    Logger.info(s"Published message: $result")
  }

}
