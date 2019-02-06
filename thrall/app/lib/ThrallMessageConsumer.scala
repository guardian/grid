package lib

import com.gu.mediaservice.lib.aws.MessageConsumer
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

class ThrallMessageConsumer(
  config: ThrallConfig,
  es: ElasticSearchVersion,
  thrallMetrics: ThrallMetrics,
  store: ThrallStore,
  metadataNotifications: DynamoNotifications,
  syndicationRightsOps: SyndicationRightsOps
)(implicit ec: ExecutionContext) extends MessageConsumer(
  config.queueUrl,
  config.awsEndpoint,
  config,
  thrallMetrics.snsMessage
) {

  val messageProcessor = new MessageProcessor(es, store, metadataNotifications, syndicationRightsOps)

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] = {
    messageProcessor.chooseProcessor(subject)
  }

}