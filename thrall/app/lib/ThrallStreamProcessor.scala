package lib

import akka.actor.ActorSystem
import akka.stream.scaladsl.{GraphDSL, MergePreferred, Source}
import akka.stream.{Materializer, SourceShape}
import akka.{Done, NotUsed}
import com.contxt.kinesis.KinesisRecord
import com.gu.mediaservice.lib.DateTimeUtils
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.ThrallMessage
import lib.kinesis.{MessageTranslator, ThrallEventConsumer}

import scala.concurrent.Future
import scala.util.{Failure, Success}

sealed trait Priority
case object LowPriority extends Priority {
  override def toString = "low"
}
case object HighPriority extends Priority {
  override def toString = "high"
}
case class TaggedRecord(record: KinesisRecord, priority: Priority) extends LogMarker {
  override def markerContents = Map(
    "recordPriority" -> priority.toString,
    "recordArrivalTime" -> DateTimeUtils.toString(record.approximateArrivalTimestamp)
  )
}

class ThrallStreamProcessor(
  highPrioritySource: Source[KinesisRecord, Future[Done]],
  lowPrioritySource: Source[KinesisRecord, Future[Done]],
  consumer: ThrallEventConsumer,
  actorSystem: ActorSystem,
  materializer: Materializer) extends GridLogging {

  implicit val mat = materializer
  implicit val dispatcher = actorSystem.getDispatcher

  val mergedKinesisSource: Source[TaggedRecord, NotUsed] = Source.fromGraph(GraphDSL.create() { implicit g =>
    import GraphDSL.Implicits._
    val highPriorityKinesisSource = highPrioritySource.map(TaggedRecord(_, HighPriority))
    val lowPriorityKinesisSource = lowPrioritySource.map(TaggedRecord(_, LowPriority))

    val mergePreferred = g.add(MergePreferred[TaggedRecord](1))

    highPriorityKinesisSource ~> mergePreferred.preferred
    lowPriorityKinesisSource  ~> mergePreferred.in(0)

    SourceShape(mergePreferred.out)
  })

  def createStream(): Source[(TaggedRecord, Stopwatch, Either[Throwable, ThrallMessage]), NotUsed] = {
    mergedKinesisSource.map{ taggedRecord =>
      taggedRecord -> (for{
      updateMessage <- ThrallEventConsumer.parseRecord(taggedRecord.record.data.toArray, taggedRecord.record.approximateArrivalTimestamp)
      thrallMessage <- MessageTranslator.translate(updateMessage)
    } yield thrallMessage)
    }.mapAsync(1) { result =>
      val stopwatch = Stopwatch.start
      result match {
        case (record, Right(updateMessage)) =>
          consumer.processUpdateMessage(updateMessage)
            .recover { case _ => () }
            .map(_ => (record, stopwatch, Right(updateMessage)))
        case (record, Left(whoops)) => {
          logger.warn("Unable to parse message.", whoops)
          Future.successful((record, stopwatch, Left(whoops)))
        }
      }
    }
  }

  def run(): Future[Done] = {
    val stream = this.createStream().runForeach {
      case (taggedRecord, stopwatch, maybeUpdateMessage) =>
        val basicMakers = combineMarkers(taggedRecord, stopwatch.elapsed)
        val markers = maybeUpdateMessage.map(combineMarkers(basicMakers, _)).getOrElse(basicMakers)

        logger.info(markers, "Record processed")
        taggedRecord.record.markProcessed()
    }

    stream.onComplete {
      case Failure(exception) => logger.error("stream completed with failure", exception)
      case Success(_) => logger.info("Stream completed with done, probably shutting down")
    }

    stream
  }
}
