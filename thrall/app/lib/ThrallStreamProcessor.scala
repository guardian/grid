package lib

import akka.{Done, NotUsed}
import akka.actor.ActorSystem
import akka.stream.{Materializer, SourceShape}
import akka.stream.javadsl.MergePreferred
import akka.stream.scaladsl.{GraphDSL, MergePrioritized, Source}
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.contxt.kinesis.{KinesisRecord, KinesisSource}
import lib.kinesis.ThrallEventConsumer
import play.api.Logger

import scala.concurrent.Future
import scala.util.{Failure, Success}

class ThrallStreamProcessor(highPriorityKinesisConfig: KinesisClientLibConfiguration, lowPriorityKinesisConfig: KinesisClientLibConfiguration, consumer: ThrallEventConsumer, actorSystem: ActorSystem, materializer: Materializer) {

  implicit val mat = materializer



  implicit val dispatcher = actorSystem.getDispatcher


  val mergedKinesisSource: Source[KinesisRecord, NotUsed] = Source.fromGraph(GraphDSL.create() { implicit g =>
    import GraphDSL.Implicits._

    val highPriorityKinesisSource: Source[KinesisRecord, Future[Done]] = KinesisSource(highPriorityKinesisConfig)
    val lowPriorityKinesisSource: Source[KinesisRecord, Future[Done]] = KinesisSource(lowPriorityKinesisConfig)

    val mergePreferred = g.add(MergePreferred.create[KinesisRecord](2))

    highPriorityKinesisSource ~> mergePreferred.in(0)
    lowPriorityKinesisSource  ~> mergePreferred.in(1)

    SourceShape(mergePreferred.out)
  })


  def run(): Future[Done] = {
    val streamRunning = mergedKinesisSource.map{ record =>
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
