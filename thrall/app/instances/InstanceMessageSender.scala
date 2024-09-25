package instances

import play.api.libs.json.Json
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest

class InstanceMessageSender( sqsClient: SqsClient, queueUrl: String) {

  def send(message: String): Unit = {
    sqsClient.sendMessage(SendMessageRequest.builder.queueUrl(queueUrl).messageBody(Json.toJson(message).toString()).build)
  }

}
