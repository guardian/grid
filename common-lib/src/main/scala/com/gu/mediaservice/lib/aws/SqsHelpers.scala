package com.gu.mediaservice.lib.aws

import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import com.gu.mediaservice.lib.net.URI.{decode => uriDecode}
import play.api.libs.json.Json

import scala.util.Try

trait SqsHelpers {

  val attrApproximateReceiveCount = "ApproximateReceiveCount"
  def getApproximateReceiveCount(message: SQSMessage): Int =
   Try(message.getAttributes.get(attrApproximateReceiveCount).toInt).toOption.getOrElse(-1)

  def extractS3KeyFromSqsMessage(message: SQSMessage): Try[String] = Try {

    // we only need the key, the full message shape can be seen at
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html
    // or see the SqsHelpersTest which uses example in test/resources/s3SqsMessage.json

    // note that we don't bother reading the bucket name currently, but attempt the read elsewhere based on the
    // configured bucket value, this could be checked here if we're concerned (s3Records.head \ "bucket" \ "name")

    (Json.parse(message.getBody) \ "Records" \\ "s3").toList match {
      case head :: Nil => uriDecode((head \ "object" \ "key").as[String])
      case s3Records => throw new Exception(s"Expected 1 record containing 's3' in message body, got ${s3Records.size}")
    }
  }
}
