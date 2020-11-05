package com.gu.mediaservice.lib.aws

import com.amazonaws.services.sns.model.PublishRequest
import com.amazonaws.services.sns.{AmazonSNS, AmazonSNSClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging
import play.api.libs.json.{JsValue, Json}

class SNS(config: CommonConfig, topicArn: String) extends GridLogging {
  lazy val client: AmazonSNS = config.withAWSCredentials(AmazonSNSClientBuilder.standard()).build()

  def publish(message: JsValue, subject: String) {
    val result = client.publish(new PublishRequest(topicArn, Json.stringify(message), subject))
    logger.info(s"Published message: $result")
  }

}
