package lib

import com.gu.contentapi.client.ScheduledExecutor
import com.gu.contentapi.client.model.ContentApiError
import com.gu.contentapi.client.model.v1.Content
import com.gu.crier.model.event.v1.{Event, EventPayload, EventType}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus}
import com.gu.thrift.serializer.ThriftDeserializer
import com.twitter.scrooge.ThriftStructCodec
import model.{UsageGroup, UsageGroupOps}
import org.joda.time.DateTime
import rx.lang.scala.Subject
import rx.lang.scala.subjects.PublishSubject
import software.amazon.kinesis.exceptions.ShutdownException
import software.amazon.kinesis.leases.exceptions.InvalidStateException
import software.amazon.kinesis.lifecycle.events._
import software.amazon.kinesis.processor.ShardRecordProcessor

import java.util.UUID
import scala.concurrent.ExecutionContext.Implicits.global
import scala.jdk.CollectionConverters._
import scala.util.Try

trait ContentContainer extends GridLogging {
  val content: Content
  val lastModified: DateTime
  val isReindex: Boolean

  private lazy val isEntirePieceTakenDown =
    content.fields.exists(fields => fields.firstPublicationDate.isDefined && fields.isLive.contains(false))

  def emitAsUsageGroup(
    publishSubject: Subject[WithLogMarker[UsageGroup]], usageGroupOps: UsageGroupOps
  )(implicit logMarker: LogMarker): Unit = {
    usageGroupOps.build(
      content,
      status = this match {
        case PreviewContentItem(_,_,_) => PendingUsageStatus
        case LiveContentItem(_,_,_) => PublishedUsageStatus
      },
      lastModified,
      isReindex
    ) match {
      case None => logger.debug(logMarker, s"No fields in content of crier update for payload with content ID ${content.id}")
      case Some(usageGroup) =>
        val groupingLogMarker = logMarker ++ Map("usageGroup" -> usageGroup.grouping)

        publishSubject.onNext(WithLogMarker(groupingLogMarker, usageGroup))

        if (this.isInstanceOf[PreviewContentItem] && isEntirePieceTakenDown) {
          logger.info(groupingLogMarker, s"${usageGroup.grouping} is taken down so producing empty UsageGroup to ensure any 'published' DB records are marked as removed")
          publishSubject.onNext(WithLogMarker(groupingLogMarker, usageGroup.copy(
            usages = Set.empty,
            maybeStatus = Some(PublishedUsageStatus)
          )))
        }
    }
  }
}

object CrierUsageStream {
  val observable: Subject[WithLogMarker[UsageGroup]] = PublishSubject[WithLogMarker[UsageGroup]]()
}

case class LiveContentItem(content: Content, lastModified: DateTime, isReindex: Boolean = false) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime, isReindex: Boolean = false) extends ContentContainer

abstract class CrierEventProcessor(config: UsageConfig, usageGroupOps: UsageGroupOps) extends ShardRecordProcessor with GridLogging {

  implicit val codec: ThriftStructCodec[Event] = Event

  val contentApiClient: UsageContentApiClient

  override def initialize(initializationInput: InitializationInput): Unit = {
    logger.debug(s"Initialized an event processor for shard ${initializationInput.shardId}")
  }

  override def processRecords(processRecordsInput: ProcessRecordsInput): Unit = {
    val records = processRecordsInput.records
    records.asScala.foreach { record =>
      val deserialization: Try[Event] = ThriftDeserializer.deserialize(record.data)
      deserialization.foreach(processEvent)
      deserialization.failed.foreach { e: Throwable =>
        logger.error("Failed to deserialize crier event", e)
      }
    }

    val lastRecord = records.asScala.last

    processRecordsInput.checkpointer.checkpoint(lastRecord.sequenceNumber(), lastRecord.subSequenceNumber())
  }

  override def leaseLost(leaseLostInput: LeaseLostInput): Unit = {
    // nothing to do?
    logger.debug("Lost lease, so stopping processing Crier")
  }

  override def shardEnded(shardEndedInput: ShardEndedInput): Unit = {
    try {
      shardEndedInput.checkpointer.checkpoint()
      logger.debug("Shard ended, so stopping processing Crier")
    } catch {
      case _: ShutdownException | _: InvalidStateException =>
        ()
    }
  }

  override def shutdownRequested(shutdownRequestedInput: ShutdownRequestedInput): Unit = {
    try {
      shutdownRequestedInput.checkpointer.checkpoint()
      logger.debug("Shutdown requested, so stopping processing Crier")
    } catch {
      case _: ShutdownException | _: InvalidStateException =>
        ()
    }
  }

  def getContentItem(content: Content, time: DateTime): ContentContainer


  private def processEvent(event: Event): Unit = {
    implicit val logMarker: LogMarker = MarkerMap(
      "payloadId" -> event.payloadId,
      "requestId" -> UUID.randomUUID().toString
    )

    Try {
      val dateTime: DateTime = new DateTime(event.dateTime)

      event.eventType match {
        case EventType.Update =>

          event.payload match {
            case Some(content: EventPayload.Content) =>
              getContentItem(content.content, dateTime)
                .emitAsUsageGroup(CrierUsageStream.observable, usageGroupOps)
            case _ =>
              logger.warn(logMarker, s"Received crier update for ${event.payloadId} without payload")
          }
        case EventType.Delete =>
        //TODO: how do we deal with a piece of content that has been deleted?
        case EventType.RetrievableUpdate =>

          event.payload match {
            case Some(retrievableContent: EventPayload.RetrievableContent) =>
              val capiUrl = retrievableContent.retrievableContent.capiUrl

              val query = contentApiClient.usageQuery(retrievableContent.retrievableContent.id)

              logger.info(logMarker, s"retrieving content event at $capiUrl parsed to id ${query.toString}")

              contentApiClient.getResponse(query).map(response => {
                response.content match {
                  case Some(content) =>
                    getContentItem(content, dateTime)
                      .emitAsUsageGroup(CrierUsageStream.observable, usageGroupOps)
                  case _ =>
                    logger.debug(
                      logMarker,
                      s"Received retrievable update for ${retrievableContent.retrievableContent.id} without content"
                    )
                }
              }).recover {
                case e: ContentApiError =>
                  logger.error(logMarker, s"CAPI error when fetching content update for ${event.payloadId}: ${e.httpStatus} ${e.httpMessage} ${e.errorResponse}", e)
                case e =>
                  logger.error(logMarker, s"Failed to fetch or process content update for ${event.payloadId}", e)
              }
            case _ => logger.warn(logMarker, s"Received crier update for ${event.payloadId} without payload")
          }

        case _ => logger.warn(logMarker, s"Unsupported event type $EventType")
      }
    }.recover {
      case e => logger.error(logMarker, s"Failed to process event ${event.payloadId}", e)
    }
  }
}

private class CrierLiveEventProcessor(config: UsageConfig, usageGroupOps: UsageGroupOps) extends CrierEventProcessor(config, usageGroupOps) {

  def getContentItem(content: Content, date: DateTime): ContentContainer = LiveContentItem(content, date)

  override val contentApiClient: LiveContentApi = new LiveContentApi(config)(ScheduledExecutor())
}

private class CrierPreviewEventProcessor(config: UsageConfig, usageGroupOps: UsageGroupOps) extends CrierEventProcessor(config, usageGroupOps) {

  def getContentItem(content: Content, date: DateTime): ContentContainer = PreviewContentItem(content, date)

  override val contentApiClient: PreviewContentApi = new PreviewContentApi(config)(ScheduledExecutor())
}
