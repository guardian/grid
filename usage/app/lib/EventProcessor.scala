package lib

import java.util.{ List => JList }
import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.ItemQuery
import play.api.Logger
import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessorCheckpointer, IRecordProcessor}
import org.joda.time.DateTime
import com.amazonaws.services.kinesis.clientlibrary.types.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.thrift.serializer.ThriftDeserializer
import com.gu.crier.model.event.v1.{EventPayload, Event, EventType}



private class CrierEventProcessor() extends IRecordProcessor {

    override def initialize(shardId: String): Unit = {
      Logger.debug(s"Initialized an event processor for shard $shardId")
    }

    override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

      records.asScala.map { record =>

        val buffer: Array[Byte] = record.getData.array()

        for {
          result: Event <- CrierDeserializer.deserialize(buffer, false)
        } yield {

          processEvent(result)
        }

      }
    }

    override def shutdown(checkpointer: IRecordProcessorCheckpointer, reason: ShutdownReason): Unit = {
      if (reason == ShutdownReason.TERMINATE) {
        checkpointer.checkpoint()
      }
    }

    private def processEvent(event: Event): Unit = {

      val dateTime: DateTime = new DateTime(event.dateTime)

      event.eventType match {
        case EventType.Update => {

          event.payload match {
            case Some(content: EventPayload.Content) => {
              val container = new LiveContentItem(content.content, dateTime)
              LiveCrierContentStream.observable.onNext(container)
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

    object CrierDeserializer extends ThriftDeserializer[Event] {
      val codec = Event
    }
  }
