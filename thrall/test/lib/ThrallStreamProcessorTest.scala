package lib

import java.time.OffsetDateTime
import akka.Done
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.{Sink, Source}
import akka.util.ByteString
import com.contxt.kinesis.KinesisRecord
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import lib.kinesis.ThrallEventConsumer
import org.scalatest.mockito.MockitoSugar
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class ThrallStreamProcessorTest extends FunSpec with BeforeAndAfterAll with Matchers with MockitoSugar {
  private implicit val actorSystem: ActorSystem = ActorSystem()
  private implicit val materializer: ActorMaterializer = ActorMaterializer()

  def createKinesisRecord: KinesisRecord = KinesisRecord(
    data = ByteString(JsonByteArrayUtil.toByteArray(UpdateMessage(subject = "example-kinesis"))),
    partitionKey = "",
    explicitHashKey = None,
    sequenceNumber = "",
    subSequenceNumber = None,
    approximateArrivalTimestamp = OffsetDateTime.now().toInstant,
    encryptionType = ""
  )

  def createReingestionRecord: ReingestionRecord = ReingestionRecord(
    payload = UpdateMessage(subject = "example-reingestion"),
    approximateArrivalTimestamp = OffsetDateTime.now().toInstant
  )

  val COUNT_EACH = 2000 // Arbitrary number
  val COUNT_TOTAL = 3 * COUNT_EACH

  val uiPrioritySource: Source[KinesisRecord, Future[Done.type]] =
    Source.repeat(createKinesisRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
  val automationPrioritySource: Source[KinesisRecord, Future[Done.type]] =
    Source.repeat(createKinesisRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
  val reingestionPrioritySource: Source[ReingestionRecord, Future[Done.type]] =
    Source.repeat(createReingestionRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)

  lazy val mockConsumer: ThrallEventConsumer = mock[ThrallEventConsumer]
  lazy val streamProcessor = new ThrallStreamProcessor(
    uiPrioritySource,
    automationPrioritySource,
    reingestionPrioritySource,
    mockConsumer,
    actorSystem,
    materializer
  )

  describe("Stream merging strategy") {
    it("should process high priority events first") {
      val stream = streamProcessor.createStream()

      val prioritiesFromMessages =
        Await.result(stream.take(COUNT_TOTAL).runWith(Sink.seq), 5.minutes)
          .map {
            case (record, _, _) => record.priority
          }

      prioritiesFromMessages.length shouldBe COUNT_TOTAL

      val output = prioritiesFromMessages.toList
      val firstBatch = output.slice(0, COUNT_EACH - 1)
      val middleBatch = output.slice(COUNT_EACH, 2 * COUNT_EACH - 1 )
      val lastBatch = output.slice(2* COUNT_EACH,3 * COUNT_EACH - 1)

      // This is an arbitrary value - the preference algo in MergedPreferred doesn't strictly process the
      // `preferred` inlet and then the remaining inlets. It appears to take some a number from all defined inlets
      // and then the `preferred` inlet until `preferred` is mostly empty.
      //  Nonetheless the result should be that a high proportion of the highest priority turn up in the first section.
      val PERCENTAGE: Double = 95.0 / 100.0
      val MINIMUM_RECORDS: Int = (PERCENTAGE * COUNT_EACH).toInt

      firstBatch.count(p => p == UiPriority) should be > MINIMUM_RECORDS
      middleBatch.count(p => p == AutomationPriority) should be > MINIMUM_RECORDS
      lastBatch.count(p => p == ReingestionPriority) should be > MINIMUM_RECORDS

      output.count(p => p == UiPriority) should be (COUNT_EACH)
      output.count(p => p == AutomationPriority) should be (COUNT_EACH)
      output.count(p => p == ReingestionPriority) should be (COUNT_EACH)
    }
  }
}
