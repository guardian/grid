package lib

import java.time.Instant

import akka.actor.ActorSystem
import akka.stream.scaladsl.{GraphDSL, MergePreferred, MergePrioritized, Source}
import akka.stream.{Materializer, SourceShape}
import akka.{Done, NotUsed}
import com.contxt.kinesis.KinesisRecord
import com.gu.mediaservice.lib.DateTimeUtils
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.ThrallMessage
import lib.kinesis.{MessageTranslator,ThrallEventConsumer}
import scala.concurrent.Future
import scala.util.{Failure, Success}

sealed trait Priority
case object LowPriority extends Priority {
  override def toString = "low"
}
case object LowestPriority extends Priority {
  override def toString = "lowest"
}
case object HighPriority extends Priority {
  override def toString = "high"
}

trait TaggedRecord extends LogMarker {
  val payload: Array[Byte]
  val approximateArrivalTimestamp: Instant
  val priority: Priority
  def markProcessed(): Unit
  override def markerContents: Map[String, Any] = Map(
    "recordPriority" -> priority.toString,
    "recordArrivalTime" -> DateTimeUtils.toString(approximateArrivalTimestamp)
  )
}

case class TaggedKinesisRecord(record: KinesisRecord, priority: Priority) extends TaggedRecord {
  val payload: Array[Byte] = record.data.toArray
  val approximateArrivalTimestamp: Instant = record.approximateArrivalTimestamp
  override def markProcessed(): Unit = record.markProcessed()
}

case class TaggedReingestionRecord(record: ReingestionRecord, priority: Priority) extends LogMarker with TaggedRecord{
  val payload: Array[Byte] = record.payload
  val approximateArrivalTimestamp: Instant = record.approximateArrivalTimestamp
  override def markProcessed(): Unit = ???
}

class ThrallStreamProcessor(
  highPrioritySource: Source[KinesisRecord, Future[Done]],
  lowPrioritySource: Source[KinesisRecord, Future[Done]],
  reingestionSource: Source[ReingestionRecord, Future[Done]],
  consumer: ThrallEventConsumer,
  actorSystem: ActorSystem,
  materializer: Materializer) extends GridLogging {

  implicit val mat = materializer
  implicit val dispatcher = actorSystem.getDispatcher

  val mergedKinesisSource: Source[TaggedRecord, NotUsed] = Source.fromGraph(GraphDSL.create() { implicit g =>
    import GraphDSL.Implicits._
    val highPriorityKinesisSource = highPrioritySource.map(TaggedKinesisRecord(_, HighPriority))
    val lowPriorityKinesisSource = lowPrioritySource.map(TaggedKinesisRecord(_, LowPriority))
    val lowestPriorityKinesisSource = reingestionSource.map(TaggedReingestionRecord(_, LowestPriority))
    val mergePreferred1 = g.add(MergePreferred[TaggedRecord](1))
//    mergePreferred1.out.map() /// do the parse to UpdateMessage on the stream side.

    highPriorityKinesisSource ~> mergePreferred1.preferred
    lowPriorityKinesisSource  ~> mergePreferred1.in(0)

    val mergePreferred2 = g.add(MergePreferred[TaggedRecord](1))

    mergePreferred1 ~> mergePreferred2.preferred
    lowestPriorityKinesisSource  ~> mergePreferred2.in(0)

    SourceShape(mergePreferred2.out)
  })

  def createStream(): Source[(TaggedRecord, Stopwatch, Either[Throwable, ThrallMessage]), NotUsed] = {
    mergedKinesisSource.map{ taggedRecord =>
      taggedRecord -> (for{
      updateMessage <- ThrallEventConsumer.parseRecord(taggedRecord.payload, taggedRecord.approximateArrivalTimestamp)
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
        taggedRecord.markProcessed()
    }

    stream.onComplete {
      case Failure(exception) => logger.error("stream completed with failure", exception)
      case Success(_) => logger.info("Stream completed with done, probably shutting down")
    }

    stream
  }
}
