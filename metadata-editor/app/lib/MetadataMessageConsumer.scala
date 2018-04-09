package lib

import com.gu.mediaservice.lib.aws.MessageConsumer
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class MetadataMessageConsumer(config: EditsConfig, metadataEditorMetrics: MetadataEditorMetrics, store: EditsStore) extends MessageConsumer(
  config.queueUrl, config.awsEndpoint, config.awsCredentials, metadataEditorMetrics.processingLatency) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image-deleted" => processDeletedImage
    }

  def processDeletedImage(message: JsValue) = Future {
      withImageId(message)(id => store.deleteItem(id))
  }
}
