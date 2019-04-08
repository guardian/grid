package lib

import com.amazonaws.services.sqs.AmazonSQS
import com.gu.mediaservice.lib.aws.MessageConsumer
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class MetadataMessageConsumer(queueUrl: String, metadataEditorMetrics: MetadataEditorMetrics, store: EditsStore, client: AmazonSQS) extends MessageConsumer(
  queueUrl, metadataEditorMetrics.processingLatency, client) {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image-deleted" => processDeletedImage
    }

  def processDeletedImage(message: JsValue) = Future {
      withImageId(message)(id => store.deleteItem(id))
  }
}
