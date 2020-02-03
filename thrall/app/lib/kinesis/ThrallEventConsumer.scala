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
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.{JodaReads, Json, Reads}

import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{Await, ExecutionContext, Future, TimeoutException}
import scala.util.{Failure, Success, Try}

class ThrallEventConsumer(es: ElasticSearch6,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataEditorNotifications: MetadataEditorNotifications,
                          syndicationRightsOps: SyndicationRightsOps) extends IRecordProcessor with PlayJsonHelpers {

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
        parseRecord(r).map(processUpdateMessage)
      }
      try {
        checkpointer.checkpoint(records.asScala.last)
      } catch {
        case e: Throwable => Logger.error("Exception during checkpoint: ", e)
      }
    } catch {
      case e: Throwable =>
        Logger.error("Exception during process records: ", e)
    }
  }

  private def parseRecord(r: Record):Option[UpdateMessage] = {
    implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads
    implicit val unr = Json.reads[UsageNotice]
    implicit val umr = Json.reads[UpdateMessage]
    val timestamp = r.getApproximateArrivalTimestamp

    Try(JsonByteArrayUtil.fromByteArray[UpdateMessage](r.getData.array)) match {
      case Success(Some(updateMessage: UpdateMessage)) => {
        Logger.info(s"Received ${updateMessage.subject} message at $timestamp")(updateMessage.toLogMarker)
        Some(updateMessage)
      }
      case Success(None)=> None //No message received
      case Failure(e) => {
        Logger.error(s"Exception during process record block at $timestamp", e)
        None
      }
    }
  }

  private def processUpdateMessage(updateMessage: UpdateMessage) = {
    messageProcessor.chooseProcessor(updateMessage).map { messageProcessor =>
      Try(Await.ready(messageProcessor.apply(updateMessage), Timeout))
    } match {
      case Some(Success(_)) =>
        Logger.info(
          s"Completed processing of ${
            updateMessage.subject
          } message")(updateMessage.toLogMarker)
      case Some(Failure(timeoutException: TimeoutException)) =>
        Logger.error(
          s"Timeout of $Timeout reached while processing ${
            updateMessage.subject
          } message; message will be ignored:",
          timeoutException
        )(updateMessage.toLogMarker)
      case Some(Failure(e: Throwable)) =>
        Logger.error(
          s"Failed to process ${
            updateMessage.subject
          } message; message will be ignored:", e)(updateMessage.toLogMarker)
      case None =>
        Logger.error(
          s"Could not find processor for ${
            updateMessage.subject
          } message; message will be ignored")(updateMessage.toLogMarker)
    }

  }


  override def shutdown(checkpointer: IRecordProcessorCheckpointer, reason: ShutdownReason): Unit = {
    if (reason == ShutdownReason.TERMINATE) {
      checkpointer.checkpoint()
    }
  }

}
