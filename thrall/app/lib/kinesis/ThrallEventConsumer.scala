package lib.kinesis

import java.nio.charset.StandardCharsets
import java.util
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

import com.amazonaws.services.cloudwatch.model.Dimension
import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.PlayJsonHelpers
import com.gu.mediaservice.model.usage.UsageNotice
import lib._
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.{JodaReads, Json}

import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{Await, ExecutionContext}

class ThrallEventConsumer(es: ElasticSearchVersion,
                          thrallMetrics: ThrallMetrics,
                          store: ThrallStore,
                          metadataNotifications: MetadataNotifications,
                          syndicationRightsOps: SyndicationRightsOps,
                          timeMessageLastProcessed: AtomicReference[DateTime]
                         ) extends IRecordProcessor with PlayJsonHelpers {

  private val ThirtySeconds = Duration(30, SECONDS)

  private val messageProcessor = new MessageProcessor(es, store, metadataNotifications, syndicationRightsOps)

  private implicit val ctx: ExecutionContext = ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  override def initialize(shardId: String): Unit = {
    Logger.info(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: util.List[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {
    import scala.collection.JavaConverters._
    Logger.info("Processing kinesis record batch of size: " + records.size)

    def recordMessageCount(message: UpdateMessage) = {
      val dimensions = List(new Dimension().withName("subject").withValue(message.subject))
      thrallMetrics.kinesisMessage.runRecordOne(1L, dimensions)
    }

    try {
      records.asScala.foreach { r =>

        try {
          val subject = r.getPartitionKey
          val message = new String(r.getData.array(), StandardCharsets.UTF_8)
          Logger.debug("Got kinesis event: " + subject + " / " + message)

          implicit val yourJodaDateReads = JodaReads.DefaultJodaDateTimeReads
          implicit val unr = Json.reads[UsageNotice]
          implicit val umr = Json.reads[UpdateMessage]

          val updateMessage = Json.parse(message).as[UpdateMessage] // TODO validation
          val timestamp = r.getApproximateArrivalTimestamp

          val idForLogging = Seq(updateMessage.id, updateMessage.image.map(_.id)).flatten
          val messageLogMessage = "(" + timestamp + "): " + updateMessage.subject + "/" + idForLogging.mkString(" ")
          Logger.info("Got update message: " + messageLogMessage)

          messageProcessor.chooseProcessor(updateMessage).map { processor =>
            val eventuallyAppliedUpdate = processor.apply(updateMessage).map { _ =>
              Logger.info("Completed processing of update message: " + messageLogMessage)
              recordMessageCount(updateMessage)
              timeMessageLastProcessed.lazySet(DateTime.now)

            }.recover {
              case e: Throwable =>
                Logger.error("Failed to process update message; message will be ignored: " + ("Got update message: " + messageLogMessage), e)
            }

            Await.ready(eventuallyAppliedUpdate, ThirtySeconds)
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
