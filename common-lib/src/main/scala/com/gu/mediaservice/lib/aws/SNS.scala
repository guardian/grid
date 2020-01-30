package com.gu.mediaservice.lib.aws

import com.amazonaws.services.sns.model.PublishRequest
import com.amazonaws.services.sns.{AmazonSNS, AmazonSNSClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Logger
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.{ExecutionContext, Future}

class SNS(config: CommonConfig, topicArn: String) {
  lazy val client: AmazonSNS = config.withAWSCredentials(AmazonSNSClientBuilder.standard()).build()

  def publish(message: JsValue, subject: String)(implicit ec: ExecutionContext) = Future {
    val result = client.publish(new PublishRequest(topicArn, Json.stringify(message), subject))
    Logger.info(s"Published message: $result")
  }

}
