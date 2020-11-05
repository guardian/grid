package lib.kinesis

import java.time.Instant
import java.util.concurrent.Executors

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.{JsonByteArrayUtil, PlayJsonHelpers}
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.usage.UsageNotice
import lib._
import lib.elasticsearch._
import org.joda.time.DateTime
import play.api.libs.json.{JodaReads, Json, Reads}

import scala.concurrent.duration.{FiniteDuration, MILLISECONDS, SECONDS}
import scala.concurrent.{ExecutionContext, Future, TimeoutException}
import scala.util.{Failure, Success, Try}

class ThrallEventConsumer(es: ElasticSearch,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataEditorNotifications: MetadataEditorNotifications,
                          syndicationRightsOps: SyndicationRightsOps,
                          actorSystem: ActorSystem) extends PlayJsonHelpers with GridLogging {

  private val attemptTimeout = FiniteDuration(20, SECONDS)
  private val delay = FiniteDuration(1, MILLISECONDS)
  private val attempts = 2
  private val timeout = attemptTimeout * attempts + delay * (attempts - 1)

  private val messageProcessor = new MessageProcessor(es, store, metadataEditorNotifications, syndicationRightsOps)

  private implicit val implicitActorSystem: ActorSystem = actorSystem

  private implicit val executionContext: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def parseRecord(r: Array[Byte], timestamp: Instant):Option[UpdateMessage] = {
    implicit val yourJodaDateReads: Reads[DateTime] = JodaReads.DefaultJodaDateTimeReads
    implicit val unr = Json.reads[UsageNotice]
    implicit val umr = Json.reads[UpdateMessage]

    Try(JsonByteArrayUtil.fromByteArray[UpdateMessage](r)) match {
      case Success(Some(updateMessage: UpdateMessage)) => {
        logger.info(updateMessage.toLogMarker, s"Received ${updateMessage.subject} message at $timestamp")
        Some(updateMessage)
      }
      case Success(None)=> {
        logger.error(s"No message present in record at $timestamp")
        None //No message received
      }
      case Failure(e) => {
        logger.error(s"Exception during process record block at $timestamp", e)
        None
      }
    }
  }

  def processUpdateMessage(updateMessage: UpdateMessage): Future[UpdateMessage]  = {
    val marker = updateMessage

    val stopwatch = Stopwatch.start
    //Try to process the update message twice, and give them both 30 seconds to run.
        RetryHandler.handleWithRetryAndTimeout(
          /*
          * Brief note on retry strategy:
          * Trying a second time might be dangerous, hopefully waiting a reasonable length of time should mitigate this.
          * From the logs, trying again after 30 seconds should only affect 1/300,000 messages.
          *
           */
          (marker) => {
            messageProcessor.process(updateMessage, marker)
          }, attempts, attemptTimeout, delay, marker
        ).transform {
          case Success(_) => {
            logger.info(
              combineMarkers(marker, stopwatch.elapsed),
              s"Completed processing of ${updateMessage.subject} message"
            )
            Success(updateMessage)
          }
          case Failure(processorNotFoundException: ProcessorNotFoundException) => {
            logger.error(
              s"Could not find processor for ${processorNotFoundException.unknownSubject} message; message will be ignored"
            )
            Failure(processorNotFoundException)
          }
          case Failure(timeoutException: TimeoutException) => {
            logger.error(
              combineMarkers(marker, stopwatch.elapsed),
              s"Timeout of $timeout reached while processing ${updateMessage.subject} message; message will be ignored:",
              timeoutException
            )
            Failure(timeoutException)
          }
          case Failure(e: Throwable) => {
            logger.error(
              combineMarkers(marker, stopwatch.elapsed),
              s"Failed to process ${updateMessage.subject} message; message will be ignored:", e
            )
            Failure(e)
          }
        }
      }

}
