package com.gu.mediaservice.lib.aws

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.regions.Region

import java.nio.ByteBuffer
import java.util.UUID
import software.amazon.awssdk.services.kinesis.model.PutRecordRequest
import software.amazon.awssdk.services.kinesis.KinesisClient
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import com.gu.mediaservice.model.usage.UsageNotice
import net.logstash.logback.marker.{LogstashMarker, Markers}
import play.api.libs.json.{JodaWrites, Json, Writes}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import org.joda.time.DateTime

import java.net.URI

case class KinesisSenderConfig(
  override val awsRegionV2: Region,
  override val awsCredentialsV2: AwsCredentialsProvider,
  override val awsLocalEndpointUri: Option[URI],
  override val isDev: Boolean,
  streamName: String
) extends AwsClientV2BuilderUtils

class Kinesis(config: KinesisSenderConfig) extends GridLogging{


  private def getKinesisClient = config.withAWSCredentialsV2(KinesisClient.builder()).build()

  private lazy val kinesisClient: KinesisClient = getKinesisClient

  def publish[T <: LogMarker](message: T)(implicit messageWrites: Writes[T]): Unit = {
    val partitionKey = UUID.randomUUID().toString

    implicit val yourJodaDateWrites: Writes[DateTime] = JodaWrites.JodaDateTimeWrites
    implicit val unw: Writes[UsageNotice] = Json.writes[UsageNotice]

    val payload = JsonByteArrayUtil.toByteArray(message)

    val markers: LogstashMarker = message.toLogMarker.and(Markers.append("compressed-size", payload.length))
    logger.info(markers, "Publishing message to kinesis")

    val data = ByteBuffer.wrap(payload)
    val request = PutRecordRequest.builder()
                  .streamName(config.streamName)
                  .partitionKey(partitionKey).data(SdkBytes.fromByteBuffer(data))
                    .build()

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

