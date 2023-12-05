package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.amazonaws.services.sqs.AmazonSQS
import com.amazonaws.services.sqs.AmazonSQSClientBuilder
import com.amazonaws.services.sqs.model.{DeleteMessageRequest, ReceiveMessageRequest, Message => SQSMessage}

import scala.collection.JavaConverters._
import scala.collection.mutable

class SimpleSqsMessageConsumer (queueUrl: String, config: CommonConfig) {

  lazy val client: AmazonSQS = config.withAWSCredentials(AmazonSQSClientBuilder.standard()).build()

  def getNextMessage(): Option[SQSMessage] =
    client.receiveMessage(
      new ReceiveMessageRequest(queueUrl)
        .withWaitTimeSeconds(20) // Wait for maximum duration (20s) as per doc recommendation: http://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html
        .withMaxNumberOfMessages(1) // Pull 1 message at a time to avoid starvation
    ).getMessages.asScala.headOption

  def deleteMessage(message: SQSMessage): Unit =
    client.deleteMessage(new DeleteMessageRequest(queueUrl, message.getReceiptHandle))

  def getStatus: mutable.Map[String, String] = {
   client.getQueueAttributes(queueUrl, List(
      "ApproximateNumberOfMessagesDelayed",
      "ApproximateNumberOfMessages",
      "ApproximateNumberOfMessagesNotVisible"
    ).asJava).getAttributes.asScala
  }
}
