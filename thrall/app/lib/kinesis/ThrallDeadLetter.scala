package lib.kinesis

import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import com.gu.mediaservice.model.usage.UsageNotice
import lib.ThrallConfig
import net.logstash.logback.marker.{LogstashMarker, Markers}
import play.api.Logger
import play.api.libs.json.{JodaWrites, Json}


class ThrallDeadLetter(config: ThrallConfig) {
  private val builder = AmazonKinesisClientBuilder.standard()

  import config.{awsRegion, awsCredentials, thrallKinesisEndpoint, thrallDeadLetterKinesisStream}

  private def getKinesisClient: AmazonKinesis = {
    Logger.info(s"creating kinesis publisher with endpoint=$thrallKinesisEndpoint , region=$awsRegion")
    builder
      .withEndpointConfiguration(new EndpointConfiguration(thrallKinesisEndpoint, awsRegion))
      .withCredentials(awsCredentials)
      .build()
  }

  private lazy val kinesisClient: AmazonKinesis = getKinesisClient

  def publish(message: UpdateMessage) {
    val partitionKey = UUID.randomUUID().toString

    implicit val yourJodaDateWrites = JodaWrites.JodaDateTimeWrites
    implicit val unw = Json.writes[UsageNotice]

    val payload = JsonByteArrayUtil.toByteArray(message)

    val markers: LogstashMarker = message.toLogMarker.and(Markers.append("compressed-size", payload.length))
    Logger.info("Republishing message to dead letter stream")(markers)

    val data = ByteBuffer.wrap(payload)
    val request = new PutRecordRequest()
      .withStreamName(thrallDeadLetterKinesisStream)
      .withPartitionKey(partitionKey)
      .withData(data)

    try {
      val result = kinesisClient.putRecord(request)
      Logger.info(s"Published kinesis message to dead letter stream: $result")
    } catch {
      case e: Exception =>
        Logger.error(s"kinesis putRecord exception message for dead letter stream: ${e.getMessage}")
        // propagate error forward to the client
        throw e
    }
  }
}
