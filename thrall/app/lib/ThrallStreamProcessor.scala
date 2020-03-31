package lib

import akka.actor.ActorSystem
import akka.stream.javadsl.MergePreferred
import akka.stream.scaladsl.{GraphDSL, Source}
import akka.stream.{Materializer, SourceShape}
import akka.{Done, NotUsed}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.contxt.kinesis.{KinesisRecord, KinesisSource}
import lib.kinesis.ThrallEventConsumer
import play.api.Logger

import scala.concurrent.Future
import scala.util.{Failure, Success}

sealed trait Level
case object LowPriority extends Level
case object HighPriority extends Level
case class TaggedRecord[T](record: T, level: Level)

class ThrallStreamProcessor(highPriorityKinesisConfig: KinesisClientLibConfiguration, lowPriorityKinesisConfig: KinesisClientLibConfiguration, consumer: ThrallEventConsumer, actorSystem: ActorSystem, materializer: Materializer) {

  implicit val mat = materializer
  implicit val dispatcher = actorSystem.getDispatcher

  val mergedKinesisSource: Source[TaggedRecord[KinesisRecord], NotUsed] = Source.fromGraph(GraphDSL.create() { implicit g =>
    import GraphDSL.Implicits._

    val highPriorityKinesisSource = KinesisSource(highPriorityKinesisConfig).map(TaggedRecord(_, HighPriority))
    val lowPriorityKinesisSource = KinesisSource(lowPriorityKinesisConfig).map(TaggedRecord(_, LowPriority))

    val mergePreferred = g.add(MergePreferred.create[TaggedRecord[KinesisRecord]](1))

    highPriorityKinesisSource ~> mergePreferred.preferred
    lowPriorityKinesisSource  ~> mergePreferred.in(0)

    SourceShape(mergePreferred.out)
  })


  def run(): Future[Done] = {
    val streamRunning = mergedKinesisSource.map{ record =>
      record -> consumer.parseRecord(record.record.data.toArray, record.record.approximateArrivalTimestamp)
    }.mapAsync(1) {
      case (record, Some(updateMessage)) => consumer.processUpdateMessage(updateMessage).recover{case _ => ()}.map(_ => record)
      case (record, None) => Future.successful(record)
    }.runForeach { case (record) =>
      record.record.markProcessed()
    }

    streamRunning.onComplete {
      case Failure(exception) => Logger.error("stream completed with failure", exception)
      case Success(_) => Logger.info("Stream completed with done, probably shutting down")
    }

    streamRunning
  }
}
