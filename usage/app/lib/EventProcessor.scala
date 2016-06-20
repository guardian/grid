package lib

import java.util.{ List => JList }
import play.api.Logger

import _root_.rx.lang.scala.subjects.ReplaySubject
import _root_.rx.lang.scala.{Subject, Observable}
import com.gu.thrift.serializer.ThriftDeserializer

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessorCheckpointer, IRecordProcessor}
import org.joda.time.DateTime
import com.amazonaws.services.kinesis.clientlibrary.types.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.crier.model.event.v1.{Event, EventType}
import com.gu.crier.model.event.v1.EventPayload.{UnknownUnionField, Content, RetrievableContent}
import com.gu.crier.model.event.v1.{EventPayload, Event, EventType}

object MergedContentStream {
  val observable: Observable[ContentContainer] =
    LiveCrierContentStream.observable
    //.merge(PreviewContentPollStream.observable)
    //.share // Ensures that only one poller is created no matter how many subscribers
}

//TODO: Preview Content poll stream

object LiveCrierContentStream {
  val observable = ReplaySubject[ContentContainer]()
}

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

      event.eventType match {
        case EventType.Update => {

          val dateTime: DateTime = new DateTime(event.dateTime)

          event.payload match {
            case Some(content: EventPayload.Content) => {
              val container = new LiveContentItem(content, dateTime)
              LiveCrierContentStream.observable.onNext(container)
            }
            case _ => println("no content")
          }

        }
        case EventType.Delete => {
          //TODO: how do we deal with a piece of content that has been deleted?
        }
        case EventType.RetrievableUpdate => println("Retrievable update")
        case _ => Logger.debug(s"Unsupported event type $EventType")
      }
    }

    object CrierDeserializer extends ThriftDeserializer[Event] {
      val codec = Event
    }

    def extractLastModified(contentItem: Content): DateTime =
      contentItem.content.fields
        .flatMap(_.lastModified)
        .map(capiDateTime => new DateTime(capiDateTime.dateTime))
        .getOrElse(new DateTime())
  }
