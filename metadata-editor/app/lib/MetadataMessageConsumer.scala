package lib

import play.api.libs.json._
import com.gu.mediaservice.lib.aws.MessageConsumer
import com.gu.mediaservice.model._
import play.api.libs.concurrent.Execution.Implicits._

import scala.concurrent.Future

object MetadataMessageConsumer extends MessageConsumer(
  Config.queueUrl, Config.awsEndpoint, Config.awsCredentials, MetadataEditorMetrics.processingLatency) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image-indexed" => processIndexedImage
    }

  def isArchivingUsageRights[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _:StaffPhotographer | _:ContractPhotographer | _:CommissionedPhotographer => true
      case _ => false
    }

  def processIndexedImage(message: JsValue): Future[Any] = {
    message.asOpt[Image] match {
      case Some(image: Image) => {
        isArchivingUsageRights(image.usageRights) match {
          case true => DynamoEdits.setArchived(image.id, true)
          case _    => Future(image)
        }
      }
      case _ => sys.error("Couldn't parse json to Image")
    }
  }
}
