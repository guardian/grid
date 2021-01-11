package controllers

import play.api.mvc._
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.PandaUser
import lib.{MediaApiConfig, QuarantineNotificationSqsConsumer}

import scala.concurrent.{ExecutionContext, Future}

class NotificationController(auth: Authentication, consumer: QuarantineNotificationSqsConsumer, config: MediaApiConfig, override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext) extends  BaseController {


  def getQuarantineNotification = auth.async { request =>

    val user =  request.user match {
      case user: PandaUser => Some(user.user.email.toLowerCase())
      case _ => None
    }
    Future(Ok(consumer.getNotificationMsg(user.getOrElse(""))))
  }
}
