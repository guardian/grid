package lib

import scala.collection.JavaConverters._
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.duration._

import com.amazonaws.services.sqs.AmazonSQSClient
import com.amazonaws.services.sqs.model.{ReceiveMessageRequest, Message}

import play.api.Logger
import play.api.libs.json._
import play.api.libs.functional.syntax._
import akka.actor.ActorSystem
import scalaz.syntax.id._

import com.gu.mediaservice.lib.json.PlayJsonHelpers._

object MessageConsumer {

  val actorSystem = ActorSystem("MessageConsumer")

  implicit val ctx: ExecutionContext = actorSystem.dispatcher

  def startSchedule(): Unit =
    actorSystem.scheduler.schedule(0 seconds, 5 seconds)(processMessages())

  lazy val client = {
    val client = new AmazonSQSClient(Config.awsCredentials)
    client.setEndpoint("ec2.eu-west-1.amazonaws.com")
    client
  }

  def processMessages(): Unit =
    for {
      received <- pollFuture(4)
      messages = received flatMap extractSNSMessage
    } {
      for (msg <- messages) Logger.info(msg.body.toString)
    }

  def poll(max: Int): Seq[Message] =
    client.receiveMessage(new ReceiveMessageRequest(Config.queueUrl)).getMessages.asScala.toList

  /* The java Future used by the Async SQS client is useless,
     so we just hide the synchronous call in a scala Future. */
  def pollFuture(max: Int): Future[Seq[Message]] =
    Future(poll(max))

  def extractSNSMessage(sqsMessage: Message): Option[SNSMessage] =
    Json.fromJson[SNSMessage](Json.parse(sqsMessage.getBody)) <| logParseErrors |> (_.asOpt)

}

case class SNSMessage(
  messageType: String,
  messageId: String,
  topicArn: String,
  subject: Option[String],
  body: JsValue
)

object SNSMessage {
  implicit def snsMessageReads: Reads[SNSMessage] =
    (
      (__ \ "Type").read[String] ~
      (__ \ "MessageId").read[String] ~
      (__ \ "TopicArn").read[String] ~
      (__ \ "Subject").readNullable[String] ~
      (__ \ "Message").read[JsValue]
    )(SNSMessage(_, _, _, _, _))
}
