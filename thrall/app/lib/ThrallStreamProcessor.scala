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
import com.gu.mediaservice.model.ExternalThrallMessage
import lib.kinesis.{MessageTranslator,ThrallEventConsumer}
import scala.concurrent.Future
import scala.util.{Failure, Success}

sealed trait Priority
case object UiPriority extends Priority {
  override def toString = "high"
}
case object AutomationPriority extends Priority {
  override def toString = "low"
}
case object MigrationPriority extends Priority {
  override def toString = "lowest"
}

/** TaggedRecord represents a message and its associated priority
  *
  * Type parameter P represents the type of the payload, so TaggedRecord
  * can be used to represent both messages from Kinesis and messages
  * originating within thrall itself
*/
case class TaggedRecord[P](payload: P,
                           arrivalTimestamp: Instant,
                           priority: Priority,
                           markProcessed: () => Unit) extends LogMarker {
  override def markerContents: Map[String, Any] = (payload match {
    case withMarker:LogMarker => withMarker.markerContents
    case _ => Map()
  }) ++ Map(
    "recordPriority" -> priority.toString,
    "recordArrivalTime" -> DateTimeUtils.toString (arrivalTimestamp)
  )

  def map[V](f: P => V): TaggedRecord[V] = this.copy(payload = f(payload))
}

class ThrallStreamProcessor(
  uiSource: Source[KinesisRecord, Future[Done]],
  automationSource: Source[KinesisRecord, Future[Done]],
  migrationSource: Source[MigrationRecord, Future[Done]],
  consumer: ThrallEventConsumer,
  actorSystem: ActorSystem,
  materializer: Materializer
 ) extends GridLogging {

  implicit val mat = materializer
  implicit val dispatcher = actorSystem.getDispatcher

  val mergedKinesisSource: Source[TaggedRecord[ExternalThrallMessage], NotUsed] = Source.fromGraph(GraphDSL.create() { implicit graphBuilder =>
    import GraphDSL.Implicits._

    val uiRecordSource = uiSource.map(kinesisRecord =>
      TaggedRecord(kinesisRecord.data.toArray, kinesisRecord.approximateArrivalTimestamp, UiPriority, kinesisRecord.markProcessed))

    val automationRecordSource = automationSource.map(kinesisRecord =>
      TaggedRecord(kinesisRecord.data.toArray, kinesisRecord.approximateArrivalTimestamp, AutomationPriority, kinesisRecord.markProcessed))

    val migrationMessagesSource: Source[TaggedRecord[ExternalThrallMessage], Future[Done]] = migrationSource.map { case MigrationRecord(externalThrallMessage, time) =>
      TaggedRecord(externalThrallMessage, time, MigrationPriority, () => {})
    }

    // merge together ui and automation kinesis records
    val uiAndAutomationRecordsMerge = graphBuilder.add(MergePreferred[TaggedRecord[Array[Byte]]](1))
    uiRecordSource ~> uiAndAutomationRecordsMerge.preferred
    automationRecordSource  ~> uiAndAutomationRecordsMerge.in(0)

    // parse the kinesis records into thrall update messages (dropping those that fail)
    val uiAndAutomationMessagesSource: PortOps[TaggedRecord[ExternalThrallMessage]] =
      uiAndAutomationRecordsMerge.out
        .map { taggedRecord =>
          ThrallEventConsumer
            .parseRecord(taggedRecord.payload, taggedRecord.arrivalTimestamp)
            .map(
              message => taggedRecord.copy(payload = message)
            )
        }
        .collect{
          case Right(taggedRecord) => taggedRecord
        }

    // merge in the re-ingestion source (preferring ui/automation)
    val mergePreferred = graphBuilder.add(MergePreferred[TaggedRecord[ExternalThrallMessage]](1))
    uiAndAutomationMessagesSource ~> mergePreferred.preferred
    migrationMessagesSource ~> mergePreferred.in(0)

    SourceShape(mergePreferred.out)
  })

  def createStream(): Source[(TaggedRecord[ExternalThrallMessage], Stopwatch, ExternalThrallMessage), NotUsed] = {
    mergedKinesisSource.mapAsync(1) { result =>
      val stopwatch = Stopwatch.start
      consumer.processUpdateMessage(result.payload)
        .recover { case _ => () }
        .map(_ => (result, stopwatch, result.payload))
      }


  }
  def run(): Future[Done] = {
    val stream = this.createStream().runForeach {
      case (taggedRecord, stopwatch, _) =>
        val markers = combineMarkers(taggedRecord, stopwatch.elapsed)
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

