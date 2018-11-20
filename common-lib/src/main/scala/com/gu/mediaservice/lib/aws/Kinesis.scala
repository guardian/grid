package com.gu.mediaservice.lib.aws

import java.nio.ByteBuffer

import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import play.api.Logger
import play.api.libs.json.{JsValue, Json}

class Kinesis(config: CommonConfig, streamName: String) {
  lazy val client: AmazonKinesis = config.withAWSCredentials(AmazonKinesisClientBuilder.standard()).build()

  def publish(message: JsValue, subject: String) {
    val request = new PutRecordRequest()
      .withStreamName(streamName)
      .withPartitionKey(subject)
      .withData(ByteBuffer.wrap(Json.toBytes(message)))

    val result = client.putRecord(request)
    Logger.info(s"Published kinesis message: $result")
  }
}
