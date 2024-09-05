package lib

import com.gu.mediaservice.lib.aws.SqsViaSnsMessageConsumer
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Instance
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class MetadataSqsMessageConsumer(config: EditsConfig, metadataEditorMetrics: MetadataEditorMetrics, store: EditsStore) extends SqsViaSnsMessageConsumer(
  config.queueUrl, config, metadataEditorMetrics.snsMessage) with GridLogging {

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] =
    PartialFunction.condOpt(subject) {
      case "image-deleted" => processDeletedImage
    }

  def processDeletedImage(message: JsValue) = Future {
    def deleteInstanceImage(id: String, instance: String) = {
      implicit val i: Instance = Instance(id = instance)
      logger.info(s"Got image-deleted message for id $id in instance $instance")
      store.deleteItem(id)
    }

    withImageIdAndInstance(message)(deleteInstanceImage)
  }
}
