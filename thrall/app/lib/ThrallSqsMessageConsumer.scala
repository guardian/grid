package lib

import com.gu.mediaservice.lib.aws.{Kinesis, SqsMessageConsumer}
import org.joda.time.DateTime
import play.api.libs.json.JsValue

import scala.concurrent.{ExecutionContext, Future}

class ThrallSqsMessageConsumer(
                             config: ThrallConfig,
                             es: ElasticSearchVersion,
                             thrallMetrics: ThrallMetrics,
                             store: ThrallStore,
                             syndicationRightsOps: SyndicationRightsOps
)(implicit ec: ExecutionContext) extends SqsMessageConsumer (
  config.queueUrl,
  config.awsEndpoint,
  config,
  thrallMetrics.snsMessage
) with MessageConsumerVersion {

  val kinesis: Kinesis = new Kinesis(config, config.thrallKinesisStream)

  val messageProcessor = new MessageProcessor(es, store, syndicationRightsOps, kinesis)

  override def chooseProcessor(subject: String): Option[JsValue => Future[Any]] = {
    messageProcessor.chooseProcessor(subject)
  }

  override def isStopped: Boolean = {
    actorSystem.whenTerminated.isCompleted
  }

  override def lastProcessed: DateTime = timeMessageLastProcessed.get

}
