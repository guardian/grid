package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging
import play.api.libs.json.{JsValue, Json}
import software.amazon.awssdk.services.sns.SnsClient
import software.amazon.awssdk.services.sns.model.PublishRequest
class SNS(config: CommonConfig, topicArn: String) extends GridLogging {
  lazy val client = config.withAWSCredentialsV2(SnsClient.builder()).build()

  def publish(message: JsValue, subject: String): Unit = {
    val result = client.publish(PublishRequest.builder().topicArn(topicArn).message(Json.stringify(message)).subject(subject).build())
    logger.info(s"Published message: $result")
  }

}
