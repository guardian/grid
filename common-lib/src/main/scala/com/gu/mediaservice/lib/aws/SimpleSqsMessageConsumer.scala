package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.amazonaws.services.sqs.AmazonSQS
import com.amazonaws.services.sqs.AmazonSQSClientBuilder
import com.amazonaws.services.sqs.model.{ChangeMessageVisibilityRequest, DeleteMessageRequest, ReceiveMessageRequest, Message => SQSMessage}

import scala.jdk.CollectionConverters._

class SimpleSqsMessageConsumer (queueUrl: String, config: CommonConfig) {

  lazy val client: AmazonSQS = config.withAWSCredentials(AmazonSQSClientBuilder.standard()).build()

  def getNextMessage(attributeNames: String*): Option[SQSMessage] =
    client.receiveMessage(
      new ReceiveMessageRequest(queueUrl)
        .withWaitTimeSeconds(20) // Wait for maximum duration (20s) as per doc recommendation: http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html
        .withMaxNumberOfMessages(1) // Pull 1 message at a time to avoid starvation
        .withAttributeNames(attributeNames: _*)
    ).getMessages.asScala.headOption

  def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(queueUrl, message.getReceiptHandle))

  def makeMessageVisible(message: SQSMessage): Unit =
    client.changeMessageVisibility(new ChangeMessageVisibilityRequest(queueUrl, message.getReceiptHandle, 0))

  def getStatus: Map[String, String] = {
   client.getQueueAttributes(queueUrl, List(
      "ApproximateNumberOfMessagesDelayed",
      "ApproximateNumberOfMessages",
      "ApproximateNumberOfMessagesNotVisible"
    ).asJava).getAttributes.asScala.toMap
  }
}
