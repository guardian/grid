package lib

import com.gu.mediaservice.lib.aws.{Kinesis, MessageConsumer}
import org.joda.time.DateTime
import play.api.libs.json.JsValue

import scala.concurrent.{ExecutionContext, Future}

class ThrallMessageConsumer(
                             config: ThrallConfig,
                             thrallMetrics: ThrallMetrics,
                             store: ThrallStore,
                             metadataNotifications: MetadataNotifications
)(implicit ec: ExecutionContext) extends MessageConsumer (
  config.queueUrl,
  config.awsEndpoint,
  config,
  thrallMetrics.snsMessage
) with MessageConsumerVersion {

  val kinesis: Kinesis = new Kinesis(config, config.thrallKinesisStream)

  val messageProcessor = new MessageProcessor(kinesis)

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] = {
    messageProcessor.chooseProcessor(subject)
  }

  override def isStopped: Boolean = {
    actorSystem.whenTerminated.isCompleted
  }

  override def lastProcessed: DateTime = timeMessageLastProcessed.get

}
