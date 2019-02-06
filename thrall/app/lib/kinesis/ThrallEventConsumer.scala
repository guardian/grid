package lib.kinesis

import java.nio.charset.StandardCharsets
import java.util

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.mediaservice.lib.json.PlayJsonHelpers
import com.gu.mediaservice.lib.logging.GridLogger
import lib._
import play.api.Logger
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.ExecutionContext.Implicits.global  // TODO MessageConsumer has something more complicated.

class ThrallEventConsumer(es: ElasticSearchVersion,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataNotifications: DynamoNotifications,
                          syndicationRightsOps: SyndicationRightsOps) extends IRecordProcessor with PlayJsonHelpers {

  private val messageProcessor = new MessageProcessor(es, store, metadataNotifications, syndicationRightsOps)

  override def initialize(shardId: String): Unit = {
    Logger.debug(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: util.List[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {
    import scala.collection.JavaConverters._
    records.asScala.map { r =>
      val subject = r.getPartitionKey
      val message = new String(r.getData.array(), StandardCharsets.UTF_8)
      GridLogger.info("Got thrall event: " + subject + " / " + message)

      val body: JsValue = Json.parse(message) // TODO validation

      val maybeProcessor = messageProcessor.chooseProcessor(subject)
      maybeProcessor.map { p =>
        p.apply(body)
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