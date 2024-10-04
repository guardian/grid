package instances

import play.api.libs.json.{Json, OWrites}
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest

class InstanceMessageSender(sqsClient: SqsClient, queueUrl: String) {

  def send(message: String): Unit = {
    sqsClient.sendMessage(SendMessageRequest.builder.queueUrl(queueUrl).messageBody(Json.toJson(message).toString()).build)
  }

}

case class InstanceStatusMessage(instance: String, status: String)
object InstanceStatusMessage {
  implicit val iumw: OWrites[InstanceStatusMessage] = Json.writes[InstanceStatusMessage]
}

case class InstanceUsageMessage(instance: String, imageCount: Long, totalImageSize: Long, softDeletedCount: Long)
object InstanceUsageMessage {
  implicit val iumw: OWrites[InstanceUsageMessage] = Json.writes[InstanceUsageMessage]
}
