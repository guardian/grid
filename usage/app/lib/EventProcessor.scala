package lib

import java.nio.ByteBuffer
import java.util.{ List => JList }
import com.fasterxml.jackson.databind.util.ByteBufferBackedInputStream
import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.ItemQuery
import com.gu.contentapi.client.model.v1.Content
import org.apache.thrift.protocol.TCompactProtocol
import org.apache.thrift.transport.TIOStreamTransport
import play.api.Logger
import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessorCheckpointer, IRecordProcessor}
import org.joda.time.DateTime
import com.amazonaws.services.kinesis.clientlibrary.types.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.crier.model.event.v1.{EventPayload, Event, EventType}
import scala.util.{Try}

// Instantiates a new deserializer for type event to deserialize bytes to Event
object CrierDeserializer {
  val codec = Event

  def deserialize(buffer: Array[Byte]): Try[Event] = {
    Try {
      val byteBuffer: ByteBuffer = ByteBuffer.wrap(buffer)
      val bbis = new ByteBufferBackedInputStream(byteBuffer)
      val transport = new TIOStreamTransport(bbis)
      val protocol = new TCompactProtocol(transport)
      codec.decode(protocol)
    }
  }
}

trait EventProcessor extends IRecordProcessor {

  val contentStream: ContentStream

  override def initialize(shardId: String): Unit = {
    Logger.debug(s"Initialized an event processor for shard $shardId")
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
      case EventType.Update => {

        event.payload match {
          case Some(content: EventPayload.Content) => {
            val container = getContentItem(content.content, dateTime)
            contentStream.observable.onNext(container)
          }
          case _ => Logger.debug(s"Received crier udpate for ${event.payloadId} without payload")
        }

      }
      case EventType.Delete => {
        //TODO: how do we deal with a piece of content that has been deleted?
      }
      case EventType.RetrievableUpdate => {

        event.payload match {
          case Some(retrievableContent: EventPayload.RetrievableContent) => {
            val capiUrl = retrievableContent.retrievableContent.capiUrl

            val capi: GuardianContentClient = LiveContentApi

            val query = ItemQuery(capiUrl, Map())

            capi.getResponse(query).map(response => {

              response.content match {
                case Some(content) => {

                  val container = new LiveContentItem(content, dateTime)
                  LiveCrierContentStream.observable.onNext(container)

                }
                case _ => Logger.debug(s"Received retrievable update for ${retrievableContent.retrievableContent.id} without content")
              }
            })
          }
          case _ => Logger.debug(s"Received crier udpate for ${event.payloadId} without payload")
        }
      }

      case _ => Logger.debug(s"Unsupported event type $EventType")
    }
  }
}

private class CrierLiveEventProcessor() extends EventProcessor {

  val contentStream = LiveCrierContentStream

  def getContentItem(content: Content, date: DateTime): ContentContainer =
    new LiveContentItem(content, date)


  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

    records.asScala.map { record =>

      val buffer: Array[Byte] = record.getData.array()
      CrierDeserializer.deserialize(buffer).map(processEvent)
    }
  }
}

private class CrierPreviewEventProcessor() extends EventProcessor {

  val contentStream = PreviewCrierContentStream

  def getContentItem(content: Content, date: DateTime): ContentContainer =
    new PreviewContentItem(content, date)

  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

    records.asScala.map { record =>

      val buffer: Array[Byte] = record.getData.array()
      CrierDeserializer.deserialize(buffer).map(processEvent)

    }
  }
}
