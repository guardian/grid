package lib

import java.nio.ByteBuffer
import java.util.{List => JList}

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessor, IRecordProcessorCheckpointer}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.fasterxml.jackson.databind.util.ByteBufferBackedInputStream
import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.ItemQuery
import com.gu.contentapi.client.model.v1.Content
import com.gu.crier.model.event.v1.{Event, EventPayload, EventType}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.thrift.serializer.ThriftDeserializer
import org.apache.thrift.protocol.TCompactProtocol
import org.apache.thrift.transport.TIOStreamTransport
import org.joda.time.DateTime
import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.util.Try

abstract class EventProcessor(config: UsageConfig) extends IRecordProcessor with GridLogging {

  implicit val codec = Event

  val contentStream: ContentStream

  override def initialize(shardId: String): Unit = {
    logger.debug(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit


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
            val container = getContentItem(content.content, dateTime)
            contentStream.observable.onNext(container)
          case _ => logger.debug(s"Received crier update for ${event.payloadId} without payload")
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

                  val container = new LiveContentItem(content, dateTime)
                  LiveCrierContentStream.observable.onNext(container)
                case _ => logger.debug(s"Received retrievable update for ${retrievableContent.retrievableContent.id} without content")
              }
            })
          case _ => logger.debug(s"Received crier update for ${event.payloadId} without payload")
        }

      case _ => logger.debug(s"Unsupported event type $EventType")
    }
  }
}

private class CrierLiveEventProcessor(config: UsageConfig) extends EventProcessor(config) {

  val contentStream = LiveCrierContentStream

  def getContentItem(content: Content, date: DateTime): ContentContainer = LiveContentItem(content, date)

  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

    records.asScala.map { record =>

      val buffer: Array[Byte] = record.getData.array()
      ThriftDeserializer.deserialize(buffer).map(processEvent)

    }

    checkpointer.checkpoint(records.asScala.last)
  }
}

private class CrierPreviewEventProcessor(config: UsageConfig) extends EventProcessor(config) {

  val contentStream = PreviewCrierContentStream

  def getContentItem(content: Content, date: DateTime): ContentContainer = PreviewContentItem(content, date)

  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

    records.asScala.map { record =>

      val buffer: Array[Byte] = record.getData.array()
      ThriftDeserializer.deserialize(buffer).map(processEvent)

    }

    checkpointer.checkpoint(records.asScala.last)
  }
}
