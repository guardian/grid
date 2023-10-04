package controllers
import com.gu.mediaservice.lib.auth.{Authentication, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.logging.GridLogging
import scala.concurrent.{ExecutionContext, Future}
import play.api.mvc.{ControllerComponents, BaseController}
import com.gu.mediaservice.lib.config.Services
import scala.concurrent.{Await,duration}
import scala.concurrent.duration.{Duration, FiniteDuration}
import akka.actor.ActorSystem


class UploadQueueController(
  override val controllerComponents: ControllerComponents
)(implicit val ec: ExecutionContext)
 extends BaseController with GridLogging {


  def reportAll = Action {
    val count =  Await.result[Integer](readSqs(), Duration(5, duration.SECONDS))
    Ok(s"no report implemented, test count $count")
  }

  private def readSqs() = Future[Integer] {
    logger.info("reading count of messages in sqs (placeholder)")
    0
  }

}
