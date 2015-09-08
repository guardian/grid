package lib

import com.gu.mediaservice.lib.aws.MessageConsumer
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

object MetadataMessageConsumer extends MessageConsumer(
  Config.queueUrl, Config.awsEndpoint, Config.awsCredentials, MetadataEditorMetrics.processingLatency) with DynamoEdits {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image-deleted" => processDeletedImage
    }

  def processDeletedImage(message: JsValue) = Future {
      withImageId(message)(id => dynamo.deleteItem(id))
  }
}
