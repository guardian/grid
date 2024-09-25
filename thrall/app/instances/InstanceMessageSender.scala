package instances

import play.api.libs.json.{JsObject, JsString, Json, OWrites}
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest

class InstanceMessageSender(sqsClient: SqsClient, queueUrl: String) {

  def send(message: InstanceMessage): Unit = {
    import play.api.libs.json._
    val wireFormatMessage = message match {
      case statusMessage: InstanceStatusMessage =>
        Some(Json.obj(
          "type" -> JsString("status"),
          "body" -> Json.toJson(statusMessage)
        ))
      case usageMessage: InstanceUsageMessage =>
        Some(Json.obj(
          "type" -> JsString("usage"),
          "body" -> Json.toJson(usageMessage)
        ))
    }

    wireFormatMessage.foreach { message =>
      sqsClient.sendMessage(SendMessageRequest.builder.queueUrl(queueUrl).messageBody(Json.toJson(message).toString()).build)
    }
  }

}

trait InstanceMessage

case class InstanceStatusMessage(instance: String, status: String) extends InstanceMessage

object InstanceStatusMessage {
  implicit val iumw: OWrites[InstanceStatusMessage] = Json.writes[InstanceStatusMessage]
}

case class InstanceUsageMessage(instance: String, imageCount: Long, totalImageSize: Long, softDeletedCount: Long) extends InstanceMessage

object InstanceUsageMessage {
  implicit val iumw: OWrites[InstanceUsageMessage] = Json.writes[InstanceUsageMessage]
}
