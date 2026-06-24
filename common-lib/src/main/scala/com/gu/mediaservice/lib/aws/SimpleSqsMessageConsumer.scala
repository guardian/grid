package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.{ChangeMessageVisibilityRequest, DeleteMessageRequest, GetQueueAttributesRequest, MessageSystemAttributeName, QueueAttributeName, ReceiveMessageRequest, SendMessageRequest, SendMessageResponse, Message => SQSMessage}

import scala.jdk.CollectionConverters._

class SimpleSqsMessageConsumer (queueUrl: String, config: CommonConfig) {

  lazy val client= config.withAWSCredentialsV2(SqsClient.builder()).build()

  def getNextMessage(attributeNames: MessageSystemAttributeName*): Option[SQSMessage] =
    client.receiveMessage(
      ReceiveMessageRequest.builder().queueUrl(queueUrl)
        .waitTimeSeconds(20) // Wait for maximum duration (20s) as per doc recommendation: http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html
        .maxNumberOfMessages(1) // Pull 1 message at a time to avoid starvation
        .messageSystemAttributeNames(attributeNames: _*) // todo come back to this
        .build()
    ).messages().asScala.headOption

  def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(queueUrl, message.receiptHandle()))

  def makeMessageVisible(message: SQSMessage): Unit =
    client.changeMessageVisibility(new ChangeMessageVisibilityRequest(queueUrl, message.receiptHandle(), 0))

  def getStatus: Map[String, String] = {
    client.getQueueAttributes(
      GetQueueAttributesRequest.builder().
        queueUrl(queueUrl)
        .attributeNames(
          QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES,
          QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_DELAYED,
          QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE
        )
        .build()
    ).attributes().asScala.toMap.map({ case(k, v) => (k.name(), v)})
  }

  def sendMessage(messageBody: String): SendMessageResponse = {
    val sendMessageRequest: SendMessageRequest = SendMessageRequest.builder()
      .queueUrl(queueUrl)
      .messageBody(messageBody)
      .build()
    client.sendMessage(sendMessageRequest)
  }
}
