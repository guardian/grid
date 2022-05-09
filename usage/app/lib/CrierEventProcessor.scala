package lib

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.ItemQuery
import com.gu.contentapi.client.model.v1.Content
import com.gu.crier.model.event.v1.{Event, EventPayload, EventType}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.usage.{PendingUsageStatus, PublishedUsageStatus}
import com.gu.thrift.serializer.ThriftDeserializer
import model.{UsageGroup, UsageGroupOps}
import org.joda.time.DateTime
import rx.lang.scala.Subject
import rx.lang.scala.subjects.PublishSubject

import java.util.{List => JList}
import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global

trait ContentContainer extends GridLogging {
  val content: Content
  val lastModified: DateTime
  val isReindex: Boolean

  def emitAsUsageGroup(publishSubject: Subject[UsageGroup], usageGroupOps: UsageGroupOps) = usageGroupOps.build(
    content,
    status = this match {
      case PreviewContentItem(_,_,_) => PendingUsageStatus
      case LiveContentItem(_,_,_) => PublishedUsageStatus
    },
    lastModified,
    isReindex
  ) match {
    case None => logger.debug(s"No fields in content of crier update for payload with content ID ${content.id}")
    case Some(usageGroup) =>
      publishSubject.onNext(usageGroup)
      if(usageGroup.maybeStatus.contains(PendingUsageStatus) && content.fields.exists(fields => fields.firstPublicationDate.isDefined && fields.isLive.contains(false))) {
        logger.info(s"${usageGroup.grouping} is taken down so producing empty UsageGroup to ensure any 'published' DB records are marked as removed")
        publishSubject.onNext(usageGroup.copy(
          usages = Set.empty,
          maybeStatus = Some(PublishedUsageStatus)
        ))
      }
  }
}

object CrierUsageStream {
  val observable = PublishSubject[UsageGroup]()
}

case class LiveContentItem(content: Content, lastModified: DateTime, isReindex: Boolean = false) extends ContentContainer
case class PreviewContentItem(content: Content, lastModified: DateTime, isReindex: Boolean = false) extends ContentContainer

abstract class CrierEventProcessor(config: UsageConfig, usageGroupOps: UsageGroupOps) extends IRecordProcessor with GridLogging {

  implicit val codec = Event



  override def initialize(shardId: String): Unit = {
    logger.debug(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

    records.asScala.map { record =>

      val buffer: Array[Byte] = record.getData.array()
      ThriftDeserializer.deserialize(buffer).map(processEvent)
    }

    checkpointer.checkpoint(records.asScala.last)
  }

  override def shutdown(checkpointer: IRecordProcessorCheckpointer, reason: ShutdownReason): Unit = {
    if (reason == ShutdownReason.TERMINATE) {
      checkpointer.checkpoint()
    }
  }

  def getContentItem(content: Content, time: DateTime): ContentContainer


  def processEvent(event: Event): Unit = {

    val dateTime: DateTime = new DateTime(event.dateTime)

    event.eventType match {
      case EventType.Update =>

        event.payload match {
          case Some(content: EventPayload.Content) =>
            getContentItem(content.content, dateTime)
              .emitAsUsageGroup(CrierUsageStream.observable, usageGroupOps)
          case _ =>
            logger.debug(s"Received crier update for ${event.payloadId} without payload")
        }
      case EventType.Delete =>
        //TODO: how do we deal with a piece of content that has been deleted?
      case EventType.RetrievableUpdate =>

        event.payload match {
          case Some(retrievableContent: EventPayload.RetrievableContent) =>
            val capiUrl = retrievableContent.retrievableContent.capiUrl

            val capi: GuardianContentClient = new LiveContentApi(config)

            val query = ItemQuery(capiUrl, Map())

            capi.getResponse(query).map(response => {

              response.content match {
                case Some(content) =>
                  LiveContentItem(content, dateTime)
                    .emitAsUsageGroup(CrierUsageStream.observable, usageGroupOps)
                case _ =>
                  logger.debug(s"Received retrievable update for ${retrievableContent.retrievableContent.id} without content")
              }
            })
          case _ => logger.debug(s"Received crier update for ${event.payloadId} without payload")
        }

      case _ => logger.debug(s"Unsupported event type $EventType")
    }
  }
}

private class CrierLiveEventProcessor(config: UsageConfig, usageGroupOps: UsageGroupOps) extends CrierEventProcessor(config, usageGroupOps) {

  def getContentItem(content: Content, date: DateTime): ContentContainer = LiveContentItem(content, date)

}

private class CrierPreviewEventProcessor(config: UsageConfig, usageGroupOps: UsageGroupOps) extends CrierEventProcessor(config, usageGroupOps) {

  def getContentItem(content: Content, date: DateTime): ContentContainer = PreviewContentItem(content, date)
}
