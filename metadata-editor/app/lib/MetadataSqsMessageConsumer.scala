package lib

import com.gu.mediaservice.lib.aws.SqsViaSnsMessageConsumer
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class MetadataSqsMessageConsumer(config: EditsConfig, metadataEditorMetrics: MetadataEditorMetrics, store: EditsStore) extends SqsViaSnsMessageConsumer(
  config.queueUrl, config, metadataEditorMetrics.snsMessage) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image-deleted" => processDeletedImage
    }

  def processDeletedImage(message: JsValue) = Future {
      // TODO restore withImageId(message)(id => store.deleteItem(id))
  }
}
