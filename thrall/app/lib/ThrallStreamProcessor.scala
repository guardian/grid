package lib

import com.gu.kinesis.KinesisRecord
import com.gu.mediaservice.lib.DateTimeUtils
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.{ExternalThrallMessage, ThrallMessage}
import lib.kinesis.ThrallEventConsumer
import org.apache.pekko.Done
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.scaladsl.{GraphDSL, MergePreferred, Source}
import org.apache.pekko.stream.{FlowShape, KillSwitches, Materializer}

import java.time.Instant
import scala.concurrent.{ExecutionContextExecutor, Future}
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
case class TaggedRecord[+P](payload: P,
                           arrivalTimestamp: Instant,
                           priority: Priority,
                           markProcessed: () => Unit) extends LogMarker {
  override def markerContents: Map[String, Any] = (payload match {
    case withMarker:LogMarker => withMarker.markerContents
    case _ => Map.empty[String, Any]
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
  actorSystem: ActorSystem
 ) extends GridLogging {

  import GraphDSL.Implicits._

  private def waitForBoth(f1: Future[Done], f2: Future[Done]): Future[Done] = {
    f1.zip(f2).map(_ => Done)
  }

  val killSwitch = KillSwitches.shared("thrall-kill-switch")

  implicit val mat: Materializer = Materializer.matFromSystem(actorSystem)
  implicit val dispatcher: ExecutionContextExecutor = actorSystem.getDispatcher

  val uiRecordSource = uiSource.via(killSwitch.flow).map(kinesisRecord =>
    TaggedRecord(kinesisRecord.data.toArray, kinesisRecord.approximateArrivalTimestamp, UiPriority, kinesisRecord.markProcessed))

  val automationRecordSource = automationSource.via(killSwitch.flow).map(kinesisRecord =>
    TaggedRecord(kinesisRecord.data.toArray, kinesisRecord.approximateArrivalTimestamp, AutomationPriority, kinesisRecord.markProcessed))

  val migrationMessagesSource = migrationSource.via(killSwitch.flow).map { case MigrationRecord(internalThrallMessage, time) =>
    TaggedRecord(internalThrallMessage, time, MigrationPriority, () => {})
  }

  val uiAndAutomationRecordsMerge: Source[TaggedRecord[Array[Byte]], Future[Done]] = {
    val mergeGraph = GraphDSL.createGraph(automationRecordSource) { implicit b => r =>
      val merge = b.add(MergePreferred[TaggedRecord[Array[Byte]]](1, eagerComplete = false))
      r ~> merge.in(0)
      FlowShape(merge.in(1), merge.out)
    }
    uiRecordSource.viaMat(mergeGraph)(waitForBoth)
  }

  val uiAndAutomationMessagesSource: Source[TaggedRecord[ExternalThrallMessage], Future[Done]] =
    uiAndAutomationRecordsMerge
      .map { taggedRecord =>
        val parsedRecord = ThrallEventConsumer
          .parseRecord(taggedRecord.payload, taggedRecord.arrivalTimestamp)
          .map(
            message => taggedRecord.copy(payload = message)
          )
        // If we failed to parse the record (Left), we'll drop it below because we can't process it.
        // However we still need to mark the record as processed, otherwise the kinesis stream can't progress
        // and checkpoint will be stuck at this message forevermore.
        parsedRecord.left.foreach(_ => taggedRecord.markProcessed())
        parsedRecord
      }.collect {
      // drop unparseable records
        case Right(taggedRecord) => taggedRecord
      }

  val allSourcesMerged: Source[TaggedRecord[ThrallMessage], Future[Done]] = {
    val mergeGraph = GraphDSL.createGraph(migrationMessagesSource) { implicit b => r =>
      val merge = b.add(MergePreferred[TaggedRecord[ThrallMessage]](1, eagerComplete = false))
      r ~> merge.in(0)
      FlowShape(merge.in(1), merge.out)
    }
    uiAndAutomationMessagesSource.viaMat(mergeGraph)(waitForBoth)
  }

  def createStream(): Source[(TaggedRecord[ThrallMessage], Stopwatch, ThrallMessage), Future[Done]] = {
    allSourcesMerged.mapAsync(1) { result =>
      val stopwatch = Stopwatch.start
      consumer.processMessage(result.payload)
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
      case Failure(exception) => logger.error("Thrall stream completed with failure", exception)
      case Success(Done) => logger.info("Thrall stream completed with done, probably shutting down")
    }

    stream
  }
}

