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

class ThrallStreamProcessorTest extends FunSpec with BeforeAndAfterAll with Matchers with MockitoSugar {
  private implicit val actorSystem: ActorSystem = ActorSystem()
  private implicit val materializer: ActorMaterializer = ActorMaterializer()

  def createKinesisRecord: KinesisRecord = KinesisRecord(ByteString.empty, "", None, "", None, OffsetDateTime.now().toInstant, "")
  def createReingestionRecord: ReingestionRecord = ReingestionRecord(ByteString.empty.toArray, OffsetDateTime.now().toInstant)

  val COUNT_EACH = 2000
  val highPrioritySource: Source[KinesisRecord, Future[Done.type]] = Source.repeat(createKinesisRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
  val lowPrioritySource: Source[KinesisRecord, Future[Done.type]] = Source.repeat(createKinesisRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
  val reingestionSource: Source[ReingestionRecord, Future[Done.type]] = Source.repeat(createReingestionRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
  val COUNT_TOTAL = 3 * COUNT_EACH

  lazy val mockConsumer: ThrallEventConsumer = mock[ThrallEventConsumer]
  lazy val streamProcessor = new ThrallStreamProcessor(highPrioritySource, lowPrioritySource, reingestionSource, mockConsumer, actorSystem, materializer)

  describe("Stream merging strategy") {
    it("should process high priority events first") {
      val stream = streamProcessor.createStream()

      val prioritiesFromMessages = Await.result(stream.take(COUNT_TOTAL).runWith(Sink.seq), 5.minutes).map {
        case (record, _, _) => record.priority
      }

      prioritiesFromMessages.length shouldBe COUNT_TOTAL

      // it looks like MergedPreferred doesn't strictly process the `preferred` inlet and then the remaining inlets
      // but rather, it appears to take some a number from all defined inlets and then the `preferred` inlet
      // `alternatingSegment` represents this behaviour
      val alternatingSegment = Seq(LowestPriority, LowPriority, HighPriority)

      val output = prioritiesFromMessages.toList
      val mostlyHigh = output.slice(0, COUNT_EACH - 1)
      val mostlyLow = output.slice(COUNT_EACH, 2 * COUNT_EACH - 1 )
      val mostlyLowest = output.slice(2* COUNT_EACH,3 * COUNT_EACH - 1)

      val PERCENTAGE = 95 / 100

      val MINIMUM_RECORDS = COUNT_EACH * PERCENTAGE
      mostlyHigh.count(p => p == HighPriority) should be > MINIMUM_RECORDS
      mostlyLow.count(p => p == LowPriority) should be > MINIMUM_RECORDS
      mostlyLowest.count(p => p == LowestPriority) should be > MINIMUM_RECORDS

      output.count(p => p == HighPriority) should be (COUNT_EACH)
      output.count(p => p == LowPriority) should be (COUNT_EACH)
      output.count(p => p == LowestPriority) should be (COUNT_EACH)
    }
  }
}
