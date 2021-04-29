package com.gu.mediaservice.lib.aws

import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import com.gu.mediaservice.model.usage.UsageNotice
import net.logstash.logback.marker.{LogstashMarker, Markers}
import play.api.libs.json.{JodaWrites, Json, Writes}
import com.amazonaws.auth.AWSCredentialsProvider
import com.gu.mediaservice.lib.logging.GridLogging
import org.joda.time.DateTime

case class KinesisSenderConfig(
  override val awsRegion: String,
  override val awsCredentials: AWSCredentialsProvider,
  override val awsLocalEndpoint: Option[String],
  override val isDev: Boolean,
  streamName: String
) extends AwsClientBuilderUtils

class Kinesis(config: KinesisSenderConfig) extends GridLogging{

  private val builder = AmazonKinesisClientBuilder.standard()

  private def getKinesisClient: AmazonKinesis = config.withAWSCredentials(builder).build()

  private lazy val kinesisClient: AmazonKinesis = getKinesisClient

  def publish(message: UpdateMessage) {
    val partitionKey = UUID.randomUUID().toString

    implicit val yourJodaDateWrites: Writes[DateTime] = JodaWrites.JodaDateTimeWrites
    implicit val unw: Writes[UsageNotice] = Json.writes[UsageNotice]

    val payload = JsonByteArrayUtil.toByteArray(message)

    val markers: LogstashMarker = message.toLogMarker.and(Markers.append("compressed-size", payload.length))
    logger.info(markers, "Publishing message to kinesis")

    val data = ByteBuffer.wrap(payload)
    val request = new PutRecordRequest()
      .withStreamName(config.streamName)
      .withPartitionKey(partitionKey)
      .withData(data)

    try {
      val result = kinesisClient.putRecord(request)
      logger.info(markers, s"Published kinesis message: $result")
    } catch {
      case e: Exception =>
        logger.error(markers, s"kinesis putRecord failed", e)
        // propagate error forward to the client
        throw e
    }
  }
}

