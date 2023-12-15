package com.gu.mediaservice.lib.aws
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import scala.util.Try
import play.api.libs.json.{JsError, JsPath, JsSuccess, Json, Reads}
import play.api.libs.functional.syntax._ // Combinator syntax

case class S3ObjectField (
  key: String,
  size: Int,
  eTag: String,
)

case class S3BucketField (
  name: String,
  arn: String,
)

case class S3DataFromSqsMessage (
  s3SchemaVersion: Option[String],
  `object`: S3ObjectField,
  bucket: S3BucketField,
)

object S3DataFromSqsMessage {
  implicit val S3DataReads:  Reads[S3DataFromSqsMessage] = (
    (JsPath \ "s3SchemaVersion").readNullable[String] and
      (JsPath \ "object").read(Json.reads[S3ObjectField]) and
        (JsPath \ "bucket").read(Json.reads[S3BucketField])
  )(S3DataFromSqsMessage.apply _)
}

case class MessageRecord (
  eventVersion: Option[String],
  eventSource: Option[String],
  eventTime: Option[String],
  eventName: Option[String],
  s3: Option[S3DataFromSqsMessage],
)

object MessageRecord {
  implicit val MessageRecordReads = Json.reads[MessageRecord]
}

case class MessageBody(
  Records: List[MessageRecord],
)

object MessageBody {
  implicit val MessageBodyReads = Json.reads[MessageBody]
}

trait SqsHelpers {
  def getApproximateReceiveCount(message: SQSMessage): Int =
   Try(message.getAttributes().get("ApproximateReceiveCount").toInt).toOption.getOrElse(-1)

  /** Returns the time the message was first received from the queue (epoch time in milliseconds).
   * see https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html
  */
  def getUploadTime(message:SQSMessage):Int =
    Try(message.getAttributes().get("ApproximateFirstReceiveTimestamp").toInt).toOption.getOrElse(-1)

  def parseS3DataFromMessage(message: SQSMessage):Either[String,S3DataFromSqsMessage] = {
    Json.parse(message.getBody()).validate[MessageBody] match {
      case JsError(errors) => Left(errors.toString())
      case JsSuccess(value, path) => {
        val first = Try(value.Records.head).toOption
        first match {
          case None => Left("no records in message body")
          case Some(messageRecord) =>
            messageRecord.s3 match {
              case None => Left("first record had no S3data")
              case Some(s3data) => Right(s3data)
          }
        }
      }
    }
  }
}
