package lib

import com.gu.mediaservice.lib.ImageId
import com.gu.mediaservice.lib.aws.{Kinesis, UpdateMessage}
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.SyndicationRights
import play.api.libs.json.{JsError, JsValue, Reads}

import scala.concurrent.{ExecutionContext, Future}

class MessageProcessor(kinesis: Kinesis) extends ImageId {

  def chooseProcessor(subject: String)(implicit ec: ExecutionContext): Option[JsValue => Future[Any]] = {
    PartialFunction.condOpt(subject) {
      case "upsert-rcs-rights" => upsertSyndicationRights
    }
  }

  def heartbeat(msg: JsValue)(implicit ec: ExecutionContext) = Future {
    None
  }

  def upsertSyndicationRights(message: JsValue)(implicit ec: ExecutionContext) = {
    withData[SyndicationRights](message) { syndicationRights =>
      withImageId(message) { id =>
        Future.successful {
          // Mirror RCS messages onto Kinesis for migration. It was not possible to write to Kinesis from the RCS lambda
          val updateMessage = UpdateMessage(subject = "upsert-rcs-rights", id = Some(id), syndicationRights = Some(syndicationRights))
          kinesis.publish(updateMessage)
        }
      }
    }
  }

  private def withData[A: Reads](message: JsValue)(f: A => Future[Unit]): Future[Unit] =
    (message \ "data").validate[A].fold(
      err => {
        val msg = s"Unable to parse message as Edits ${JsError.toJson(err).toString}"
        GridLogger.error(msg)
        Future.failed(new RuntimeException(msg))
      }, data => f(data)
    )

}
