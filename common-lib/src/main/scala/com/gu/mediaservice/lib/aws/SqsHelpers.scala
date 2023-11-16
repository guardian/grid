package com.gu.mediaservice.lib.aws
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import scala.util.Try

trait SqsHelpers {
  def getApproximateReceiveCount(message: SQSMessage): Int =
   Try(message.getAttributes().get("ApproximateReceiveCount").toInt).toOption.getOrElse(-1)
}
