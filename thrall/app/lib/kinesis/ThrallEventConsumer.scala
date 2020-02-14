package lib.kinesis

import java.util
import java.util.concurrent.Executors

import akka.actor.ActorSystem
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.{JsonByteArrayUtil, PlayJsonHelpers}
import com.gu.mediaservice.model.usage.UsageNotice
import lib._
import lib.elasticsearch._
import org.joda.time.DateTime
import play.api.libs.json.{JodaReads, Json, Reads}
import play.api.{Logger, MarkerContext}

import scala.concurrent.duration.{FiniteDuration, SECONDS}
import scala.concurrent.{ExecutionContext, Future, TimeoutException}
import scala.util.{Failure, Success, Try}

class ThrallEventConsumer(es: ElasticSearch,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataEditorNotifications: MetadataEditorNotifications,
                          syndicationRightsOps: SyndicationRightsOps,
                          bulkIndexS3Client: BulkIndexS3Client,
                          actorSystem: ActorSystem) extends IRecordProcessor with PlayJsonHelpers {

  private val attemptTimeout = FiniteDuration(30, SECONDS)
  private val delay = FiniteDuration(5, SECONDS)
  private val attempts = 2
  private val timeout = attemptTimeout * attempts + delay * (attempts - 1)

  private val messageProcessor = new MessageProcessor(es, store, metadataEditorNotifications, syndicationRightsOps, bulkIndexS3Client)

  private implicit val implicitActorSystem: ActorSystem = actorSystem

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  override def initialize(shardId: String): Unit = {
    Logger.info(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: util.List[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {
    import scala.collection.JavaConverters._
    Logger.info("Processing kinesis record batch of size: " + records.size)

    try {
      val messages = records.asScala.toList.flatMap(parseRecord)

      OrderedFutureRunner.run(processUpdateMessage,timeout)(messages)

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
      case Success(None)=> {
        Logger.error(s"No message present in record at $timestamp")
        None //No message received
      }
      case Failure(e) => {
        Logger.error(s"Exception during process record block at $timestamp", e)
        None
      }
    }
  }

  private def processUpdateMessage(updateMessage: UpdateMessage): Future[UpdateMessage]  = {
    implicit val mc: MarkerContext = updateMessage.toLogMarker

    //Try to process the update message twice, and give them both 30 seconds to run.
    messageProcessor.chooseProcessor(updateMessage) match {
      case None => {
        Logger.error(
          s"Could not find processor for ${
            updateMessage.subject
          } message; message will be ignored")(updateMessage.toLogMarker)
        Future.failed(new Exception("Could not find processor for ${updateMessage.subject} message"))
      }
      case Some(messageProcessor) => {
        RetryHandler.handleWithRetryAndTimeout(
          /*
          * Brief note on retry strategy:
          * Trying a second time might be dangerous, hopefully waiting a reasonable length of time should mitigate this.
          * From the logs, trying again after 30 seconds should only affect 1/300,000 messages.
          *
           */
          () => messageProcessor.apply(updateMessage), attempts, attemptTimeout, delay
        ).apply().transform {
          case Success(_) => {
            Logger.info(
              s"Completed processing of ${
                updateMessage.subject
              } message")(updateMessage.toLogMarker)
            Success(updateMessage)
          }
          case Failure(timeoutException: TimeoutException) => {
            Logger.error(
              s"Timeout of $timeout reached while processing ${
                updateMessage.subject
              } message; message will be ignored:",
              timeoutException
            )(updateMessage.toLogMarker)
            Failure(timeoutException)
          }
          case Failure(e: Throwable) => {
            Logger.error(
              s"Failed to process ${
                updateMessage.subject
              } message; message will be ignored:", e)(updateMessage.toLogMarker)
            Failure(e)
          }
        }
      }
    }
  }


  override def shutdown(checkpointer: IRecordProcessorCheckpointer, reason: ShutdownReason): Unit = {
    if (reason == ShutdownReason.TERMINATE) {
      checkpointer.checkpoint()
    }
  }

}
