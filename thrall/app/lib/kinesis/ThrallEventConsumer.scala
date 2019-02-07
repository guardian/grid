package lib.kinesis

import java.nio.charset.StandardCharsets
import java.util

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.PlayJsonHelpers
import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.usage.UsageNotice
import lib._
import play.api.Logger
import play.api.libs.json.{JodaReads, Json}

import scala.concurrent.ExecutionContext.Implicits.global  // TODO MessageConsumer has something more complicated.

class ThrallEventConsumer(es: ElasticSearchVersion,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataNotifications: DynamoNotifications,
                          syndicationRightsOps: SyndicationRightsOps) extends IRecordProcessor with PlayJsonHelpers {

  private val messageProcessor = new MessageProcessor(es, store, metadataNotifications, syndicationRightsOps)

  override def initialize(shardId: String): Unit = {
    Logger.info(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: util.List[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {
    import scala.collection.JavaConverters._
    records.asScala.map { r =>
      val subject = r.getPartitionKey
      val message = new String(r.getData.array(), StandardCharsets.UTF_8)
      GridLogger.info("Got thrall event: " + subject + " / " + message)

      implicit val yourJodaDateReads = JodaReads.jodaDateReads("yyyy-MM-dd'T'HH:mm:ss.SSSZ'") // TODO
      implicit val unr = Json.reads[UsageNotice]
      implicit val umr = Json.reads[UpdateMessage]

      val updateMessage = Json.parse(message).as[UpdateMessage] // TODO validation
      Logger.info("Got update message: " + updateMessage)

      messageProcessor.chooseProcessor(updateMessage).map { p =>
        p.apply(updateMessage)
      }
    }

    checkpointer.checkpoint(records.asScala.last)
  }

  override def shutdown(checkpointer: IRecordProcessorCheckpointer, reason: ShutdownReason): Unit = {
    if (reason == ShutdownReason.TERMINATE) {
      checkpointer.checkpoint()
    }
  }

}