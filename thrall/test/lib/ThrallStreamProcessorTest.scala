package lib

import akka.Done
import akka.actor.ActorSystem
import akka.stream.{ActorMaterializer, Materializer}
import akka.stream.scaladsl.{Sink, Source}
import akka.util.ByteString
import com.contxt.kinesis.KinesisRecord
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import com.gu.mediaservice.model.{MigrateImageMessage, StaffPhotographer, ThrallMessage}
import com.sksamuel.elastic4s.ElasticApi.matchNoneQuery
import helpers.Fixtures
import lib.elasticsearch.{ElasticSearch, ReapableEligibility, ScrolledSearchResults}
import lib.kinesis.ThrallEventConsumer
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.when
import org.scalatest.BeforeAndAfterAll
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.ws.WSRequest

import java.time.OffsetDateTime
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}

class ThrallStreamProcessorTest extends AnyFunSpec with BeforeAndAfterAll with Matchers with MockitoSugar with Fixtures {
  private implicit val actorSystem: ActorSystem = ActorSystem()
  private implicit val ec: ExecutionContext = actorSystem.dispatcher
  private implicit val materializer: Materializer = Materializer.matFromSystem(actorSystem)

  describe("Stream merging strategy") {
    def createKinesisRecord: KinesisRecord = KinesisRecord(
      data = ByteString(JsonByteArrayUtil.toByteArray(UpdateMessage(subject = "delete-image", id = Some("my-id")))),
      partitionKey = "",
      explicitHashKey = None,
      sequenceNumber = "",
      subSequenceNumber = None,
      approximateArrivalTimestamp = OffsetDateTime.now().toInstant,
      encryptionType = ""
    )

    def createMigrationRecord: MigrationRecord = MigrationRecord(
      payload = MigrateImageMessage("id", Right((createImage("batman", StaffPhotographer("Bruce Wayne", "Wayne Enterprises")), 1L))),
      approximateArrivalTimestamp = OffsetDateTime.now().toInstant
    )

    val COUNT_EACH = 2000 // Arbitrary number
    val COUNT_TOTAL = 3 * COUNT_EACH

    val uiPrioritySource: Source[KinesisRecord, Future[Done.type]] =
      Source.repeat(createKinesisRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
    val automationPrioritySource: Source[KinesisRecord, Future[Done.type]] =
      Source.repeat(createKinesisRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)
    val migrationSource: Source[MigrationRecord, Future[Done.type]] =
      Source.repeat(createMigrationRecord).mapMaterializedValue(_ => Future.successful(Done)).take(COUNT_EACH)

    lazy val mockConsumer: ThrallEventConsumer = mock[ThrallEventConsumer]
    when(mockConsumer.processMessage(any[ThrallMessage]))
      .thenAnswer(i => Future.successful(i.getArgument(0)))

    lazy val streamProcessor = new ThrallStreamProcessor(
      uiPrioritySource,
      automationPrioritySource,
      migrationSource,
      mockConsumer,
      actorSystem
    )
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
      lastBatch.count(p => p == MigrationPriority) should be > MINIMUM_RECORDS

      output.count(p => p == UiPriority) should be (COUNT_EACH)
      output.count(p => p == AutomationPriority) should be (COUNT_EACH)
      output.count(p => p == MigrationPriority) should be (COUNT_EACH)
    }
  }

  describe("Migration source with sender") {
    val projectedImage = createImage("batman", StaffPhotographer("Bruce Wayne", "Wayne Enterprises"))
    lazy val mockGrid = mock[GridClient]
    when(mockGrid.getImageLoaderProjection(any(), any())(any()))
      .thenReturn(Future.successful(Some(projectedImage)))

    lazy val mockEs = mock[ElasticSearch]
    when(mockEs.continueScrollingImageIdsToMigrate(any())(any(), any()))
      .thenReturn(Future.successful(ScrolledSearchResults(List.empty, None)))
    when(mockEs.startScrollingImageIdsToMigrate(any(), any())(any(), any()))
    .thenReturn(Future.successful(ScrolledSearchResults(List.empty, None)))

    val uiPrioritySource: Source[KinesisRecord, Future[Done.type]] =
      Source.empty[KinesisRecord].mapMaterializedValue(_ => Future.successful(Done))
    val automationPrioritySource: Source[KinesisRecord, Future[Done.type]] =
      Source.empty[KinesisRecord].mapMaterializedValue(_ => Future.successful(Done))
    val migrationSourceWithSender: MigrationSourceWithSender = MigrationSourceWithSender(
      materializer,
      (req: WSRequest) => req,
      mockEs,
      mockGrid,
      projectionParallelism = 1,
      isReapableQuery = matchNoneQuery()
    )

    lazy val mockConsumer: ThrallEventConsumer = mock[ThrallEventConsumer]
    when(mockConsumer.processMessage(any[ThrallMessage]))
      .thenAnswer(i => Future.successful(i.getArgument(0)))

    lazy val streamProcessor = new ThrallStreamProcessor(
      uiPrioritySource,
      automationPrioritySource,
      migrationSourceWithSender.source,
      mockConsumer,
      actorSystem
    )

    it("can send messages manually") {
      val stream = streamProcessor.createStream()

      val request = MigrationRequest("id", 1L)

      val expectedMigrationMessage = MigrateImageMessage("id", Right(projectedImage, 1L))

      migrationSourceWithSender.send(request)

      val (_, _, firstMessageReceived) = Await.result(stream.take(1).runWith(Sink.seq), 5.seconds).head

      firstMessageReceived shouldBe expectedMigrationMessage
    }
  }
}
