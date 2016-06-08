package lib

import java.util.{ List => JList }

import com.gu.thrift.serializer.ThriftDeserializer

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global

import com.amazonaws.services.kinesis.clientlibrary.interfaces.{IRecordProcessorCheckpointer, IRecordProcessor}
import com.amazonaws.services.kinesis.clientlibrary.types.ShutdownReason
import com.amazonaws.services.kinesis.model.Record
import com.gu.crier.model.event.v1.{Event, EventType}

private class CrierEventProcessor() extends IRecordProcessor {

  override def initialize(shardId: String): Unit = {
    println(s"Initialized an event processor for shard $shardId")
  }

  override def processRecords(records: JList[Record], checkpointer: IRecordProcessorCheckpointer): Unit = {

    records.asScala.foreach { record =>
      val buffer: Array[Byte] = record.getData.array()

      for {
        result <- CrierDeserializer.deserialize(buffer)
      } yield {
        println("result is ", result)
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
      case EventType.Update => println("Update")
      case EventType.Delete => println("Delete")
      case EventType.RetrievableUpdate => println("Retrievable update")
      case _ => println("wrong event type")
    }
  }

  object CrierDeserializer extends ThriftDeserializer[Event] {
    val codec = Event
  }

}



