package lib

import com.gu.mediaservice.lib.aws.SqsMessageConsumer
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class QuarantineNotificationSqsConsumer(config: MediaApiConfig, mediaApiMetrics: MediaApiMetrics) extends SqsMessageConsumer(
  config.quarantineNotificationSqsQueueUrl, config, mediaApiMetrics.sqsMessage) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case _ => JsValue => Future{}
    }


  def getNotificationMsg(user: String): JsValue = {
    getMessages(waitTime = 3, maxMessages = 1) match {
      case message::Nil => {
        extractSNSMessage(message) match {
          case Some(msg) if ( msg.body \ "metadata" \ "uploaded_by").as[String] == user => {
            deleteMessage(message)
            msg.body
          }
          case _ => Json.obj()
        }
      }
      case Nil =>  Json.obj()
    }
  }
}
