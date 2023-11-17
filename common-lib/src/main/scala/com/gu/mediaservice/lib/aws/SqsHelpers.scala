package com.gu.mediaservice.lib.aws
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import com.amazonaws.services.s3.model.Bucket
import scala.util.Try
import play.api.libs.json.{Json, JsObject}
import play.api.libs.json.JsError
import play.api.libs.json.JsSuccess

case class S3ObjectField (
  key: String,
  size: Int,
  eTag: String,
)

object S3ObjectField {
  implicit val S3ObjectFieldReads = Json.reads[S3ObjectField]
  implicit val S3ObjectFieldWrites = Json.writes[S3ObjectField]
}

// TO DO - add more fields. yet more case classes, yet more objects
case class S3Data (
  s3SchemaVersion: Option[String],
  `object`: S3ObjectField,
)

object S3Data {
  implicit val S3DataReads = Json.reads[S3Data]
  implicit val MS3DatadWrites = Json.writes[S3Data]
}

case class MessageRecord (
  eventVersion: Option[String],
  eventSource: Option[String],
  eventTime: Option[String],
  eventName: Option[String],
  s3: Option[S3Data],
)

object MessageRecord {
  implicit val MessageRecordReads = Json.reads[MessageRecord]
  implicit val MessageRecordWrites = Json.writes[MessageRecord]
}

case class MessageBody(
  Records: List[MessageRecord],

)

object MessageBody {
  implicit val MessageBodyReads = Json.reads[MessageBody]
  implicit val MessageBodyWrites = Json.writes[MessageBody]
}

trait SqsHelpers {
  def getApproximateReceiveCount(message: SQSMessage): Int =
   Try(message.getAttributes().get("ApproximateReceiveCount").toInt).toOption.getOrElse(-1)

  def parseS3DataFromMessage(message: SQSMessage):Either[String,S3Data] = {
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
