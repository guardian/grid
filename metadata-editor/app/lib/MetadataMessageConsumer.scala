package lib

import _root_.play.api.libs.json._
import com.gu.mediaservice.lib.aws.MessageConsumer
import com.gu.mediaservice.lib.config.MetadataConfig.StaffPhotographers
import com.gu.mediaservice.model.Image

import scala.concurrent.Future
import play.api.libs.concurrent.Execution.Implicits._

object MetadataMessageConsumer extends MessageConsumer(
  Config.queueUrl, Config.awsEndpoint, Config.awsCredentials, MetadataEditorMetrics.processingLatency) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "new-image" => processNewImage
    }

  def isStaffPhotographer(image: Image) = {
    image.metadata.byline match {
      case Some(byline: String) => StaffPhotographers.store.contains(byline)
      case _                    => false
    }
  }

  def processNewImage(jsImage: JsValue): Future[Any] = {
    jsImage.asOpt[Image] match {
      case Some(image: Image) => {
        isStaffPhotographer(image) match {
          case true => DynamoEdits.setArchived(image.id, true)
          case _    => Future(image)
        }
      }
      case _ => sys.error("Couldn't parse json to Image")
    }
  }
}
