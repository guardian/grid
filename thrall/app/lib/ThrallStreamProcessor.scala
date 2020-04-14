package lib

import akka.Done
import akka.actor.ActorSystem
import akka.stream.Materializer
import akka.stream.scaladsl.Source
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.contxt.kinesis.{KinesisRecord, KinesisSource}
import lib.kinesis.ThrallEventConsumer
import play.api.Logger

import scala.concurrent.Future
import scala.util.{Failure, Success}

class ThrallStreamProcessor(config: KinesisClientLibConfiguration, consumer: ThrallEventConsumer, actorSystem: ActorSystem, materializer: Materializer) {

  implicit val mat = materializer

  val kinesisSource: Source[KinesisRecord, Future[Done]] = KinesisSource(config)

  implicit val dispatcher = actorSystem.getDispatcher

  def run(): Future[Done] = {
    val streamRunning = kinesisSource.map{ record =>
      record -> consumer.parseRecord(record.data.toArray, record.approximateArrivalTimestamp)
    }.mapAsync(1) {
      case (record, Some(updateMessage)) => consumer.processUpdateMessage(updateMessage).recover{case _ => ()}.map(_ => record)
      case (record, None) => Future.successful(record)
    }.runForeach { case (record) =>
      record.markProcessed()
    }

    streamRunning.onComplete {
      case Failure(exception) => Logger.error("stream completed with failure", exception)
      case Success(_) => Logger.info("Stream completed with done, probably shutting down")
    }

    streamRunning
  }
}
