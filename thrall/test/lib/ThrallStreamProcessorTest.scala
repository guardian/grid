package lib

import java.time.OffsetDateTime

import akka.Done
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import akka.util.ByteString
import com.contxt.kinesis.KinesisRecord
import lib.kinesis.ThrallEventConsumer
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

private class ThrallStreamProcessorTest extends FunSpec with BeforeAndAfterAll with Matchers with MockitoSugar {
  private implicit val actorSystem: ActorSystem = ActorSystem()
  private implicit val materializer: ActorMaterializer = ActorMaterializer()

  def createRecord: KinesisRecord = KinesisRecord(ByteString.empty, "", None, "", None, OffsetDateTime.now().toInstant, "")

  val highPrioritySource: Source[KinesisRecord, Future[Done.type]] = Source.repeat(createRecord).mapMaterializedValue(_ => Future.successful(Done)).take(100)
  val lowPrioritySource: Source[KinesisRecord, Future[Done.type]] = Source.repeat(createRecord).mapMaterializedValue(_ => Future.successful(Done)).take(100)

  lazy val mockConsumer: ThrallEventConsumer = mock[ThrallEventConsumer]
  lazy val streamProcessor = new ThrallStreamProcessor(highPrioritySource, lowPrioritySource, mockConsumer, actorSystem, materializer)

  describe("Stream merging strategy") {
    it("should process high priority events first") {
      val stream = streamProcessor.createStream()

      val prioritiesFromMessages = Await.result(stream.take(200).runWith(Sink.seq), 5.minutes).map {
        case (record, _, _) => record.priority
      }

      prioritiesFromMessages.length shouldBe 200

      // it looks like MergedPreferred doesn't strictly process the `preferred` inlet and then the remaining inlets
      // but rather, it appears to take some a number from all defined inlets and then the `preferred` inlet
      // `alternatingSegment` represents this behaviour
      val alternatingSegment = Seq(LowPriority, HighPriority, LowPriority)

      val expected: Seq[Priority] = alternatingSegment ++ (1 to 98).map(_ => HighPriority) ++ alternatingSegment ++ (1 to 96).map(_ => LowPriority)
      prioritiesFromMessages.toList shouldBe expected.toList
    }
  }
}
