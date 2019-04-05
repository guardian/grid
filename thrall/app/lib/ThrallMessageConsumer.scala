package lib

import com.amazonaws.services.sqs.AmazonSQS
import com.gu.mediaservice.lib.aws.{Kinesis, MessageConsumer}
import org.joda.time.DateTime
import play.api.libs.json.JsValue

import scala.concurrent.{ExecutionContext, Future}

class ThrallMessageConsumer(sqsQueueUrl: String,
                            sqsClient: AmazonSQS,
                            kinesis: Kinesis,
                            es: ElasticSearchVersion,
                            thrallMetrics: ThrallMetrics,
                            store: ThrallStore,
                            metadataNotifications: MetadataNotifications,
                            syndicationRightsOps: SyndicationRightsOps
)(implicit ec: ExecutionContext) extends MessageConsumer (
  sqsQueueUrl,
  thrallMetrics.snsMessage,
  sqsClient,
) with MessageConsumerVersion {

  val messageProcessor = new MessageProcessor(es, store, metadataNotifications, syndicationRightsOps, kinesis)

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] = {
    messageProcessor.chooseProcessor(subject)
  }

  override def isStopped: Boolean = {
    actorSystem.whenTerminated.isCompleted
  }

  override def lastProcessed: DateTime = timeMessageLastProcessed.get

}
