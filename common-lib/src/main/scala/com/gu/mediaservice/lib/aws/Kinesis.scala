package com.gu.mediaservice.lib.aws

import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.gu.mediaservice.model.usage.UsageNotice
import play.api.Logger
import play.api.libs.json.{JodaWrites, Json}

class Kinesis(config: CommonConfig, streamName: String) {
  lazy val client: AmazonKinesis = config.withAWSCredentials(AmazonKinesisClientBuilder.standard()).build()

  def publish(message: UpdateMessage) {
    val partitionKey = UUID.randomUUID().toString

    implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
    implicit val unw = Json.writes[UsageNotice]
    implicit val umw = Json.writes[UpdateMessage]

    val asJson = Json.toJson(message)
    Logger.debug("Publishing message: " + Json.stringify(asJson))
    val payload = Json.toBytes(asJson)

    val request = new PutRecordRequest()
      .withStreamName(streamName)
      .withPartitionKey(partitionKey)
      .withData(ByteBuffer.wrap(payload))

    val result = client.putRecord(request)
    Logger.info(s"Published kinesis message: $result")
  }
}
