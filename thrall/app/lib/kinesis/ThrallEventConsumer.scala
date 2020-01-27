package lib.kinesis

import java.nio.charset.StandardCharsets
import java.util
import java.util.concurrent.Executors

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.{JsonByteArrayUtil, PlayJsonHelpers}
import com.gu.mediaservice.model.usage.UsageNotice
import lib._
import play.api.Logger
import play.api.libs.json.{JodaReads, Json}

import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{Await, ExecutionContext, Future, TimeoutException}

class ThrallEventConsumer(es: ElasticSearch6,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataEditorNotifications: MetadataEditorNotifications,
                          syndicationRightsOps: SyndicationRightsOps,
                          thrallDeadLetter: ThrallDeadLetter) extends IRecordProcessor with PlayJsonHelpers {

  private val messageProcessor = new MessageProcessor(es, store, metadataEditorNotifications, syndicationRightsOps)
  private val Timeout = Duration(30, SECONDS)

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  override def initialize(shardId: String): Unit = {
    Logger.info(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: util.List[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {
    import scala.collection.JavaConverters._
    Logger.info("Processing kinesis record batch of size: " + records.size)

    try {
      records.asScala.foreach { r =>

        try {
          implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads
          implicit val unr = Json.reads[UsageNotice]
          implicit val umr = Json.reads[UpdateMessage]

          JsonByteArrayUtil.fromByteArray[UpdateMessage](r.getData.array) map { updateMessage =>
            val timestamp = r.getApproximateArrivalTimestamp

            Logger.info(s"Received ${updateMessage.subject} message at $timestamp")(updateMessage.toLogMarker)

            messageProcessor.chooseProcessor(updateMessage).map { p =>
              val eventuallyAppliedUpdate: Future[Any] = p.apply(updateMessage)
              eventuallyAppliedUpdate.map { _ =>
                Logger.info(s"Completed processing of ${updateMessage.subject} message")(updateMessage.toLogMarker)
              }.recover {
                case e: Throwable =>
                  Logger.error(s"Failed to process ${updateMessage.subject} message; message will be sent to dead letter stream:", e)(updateMessage.toLogMarker)
                  thrallDeadLetter.publish(updateMessage)
              }
              try {
                Await.ready(eventuallyAppliedUpdate, Timeout)
              } catch {
                case e: TimeoutException =>
                  Logger.error(
                    s"Timeout of $Timeout reached while processing ${updateMessage.subject} message; message will be sent to dead-letter stream:",
                    e
                  )(updateMessage.toLogMarker)
                  thrallDeadLetter.publish(updateMessage)
              }
            }
          }
        } catch {
          case e: Throwable =>
            Logger.error("Exception during process record block", e)
        }
      }

      checkpointer.checkpoint(records.asScala.last)

    } catch {
      case e: Throwable =>
        Logger.error("Exception during process records and checkpoint: ", e)
    }


  }

  override def shutdown(checkpointer: IRecordProcessorCheckpointer, reason: ShutdownReason): Unit = {
    if (reason == ShutdownReason.TERMINATE) {
      checkpointer.checkpoint()
    }
  }

}
