package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.sns.model.PublishRequest
import com.amazonaws.services.sns.{AmazonSNS, AmazonSNSClientBuilder}
import play.api.Logger
import play.api.libs.json.{JsValue, Json}


class SNS(credentials: AWSCredentialsProvider, topicArn: String) {
  lazy val client: AmazonSNS = AmazonSNSClientBuilder.standard()
    .withCredentials(credentials)
    .build()

  def publish(message: JsValue, subject: String) {
    val result = client.publish(new PublishRequest(topicArn, Json.stringify(message), subject))
    Logger.info(s"Published message: $result")
  }

}
