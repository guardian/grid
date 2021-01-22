package lib

import akka.actor.ActorSystem
import akka.stream.scaladsl.{GraphDSL, MergePreferred, Source}
import akka.stream.{Materializer, SourceShape}
import akka.{Done, NotUsed}
import com.contxt.kinesis.KinesisRecord
import com.gu.mediaservice.lib.DateTimeUtils
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging._
import lib.kinesis.ThrallEventConsumer
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

  def createStream(): Source[(TaggedRecord, Stopwatch, Option[UpdateMessage]), NotUsed] = {
    mergedKinesisSource.map{ taggedRecord =>
      taggedRecord -> consumer.parseRecord(taggedRecord.record.data.toArray, taggedRecord.record.approximateArrivalTimestamp)
    }.mapAsync(1) { result =>
      val stopwatch = Stopwatch.start
      result match {
        case (record, Some(updateMessage)) =>
          consumer.processUpdateMessage(updateMessage)
            .recover { case _ => () }
            .map(_ => (record, stopwatch, Some(updateMessage)))
        case (record, _) => Future.successful((record, stopwatch, None))
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
