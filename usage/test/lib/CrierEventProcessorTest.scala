package lib

import com.gu.contentapi.client.model.v1.Content
import com.gu.crier.model.event.v1.{Event, EventPayload, EventType, ItemType}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage.{PublishedUsageStatus}
import com.gu.thrift.serializer.ThriftSerializer
import model.{UsageGroup, UsageGroupOps}
import org.apache.pekko.actor.ActorSystem
import org.apache.pekko.stream.SystemMaterializer
import org.apache.pekko.stream.scaladsl.{Keep, Sink}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{doThrow, never, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import software.amazon.kinesis.lifecycle.events.ProcessRecordsInput
import software.amazon.kinesis.processor.RecordProcessorCheckpointer
import software.amazon.kinesis.retrieval.KinesisClientRecord

import java.time.Instant
import java.util.Collections
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

class CrierEventProcessorTest extends AnyFunSuite with Matchers with MockitoSugar {

  private class TestProcessor(usageGroupOps: UsageGroupOps, stream: UsageGroupStream)
    extends CrierEventProcessor(mock[UsageConfig], usageGroupOps, stream) {
    override val contentApiClient: UsageContentApiClient = mock[UsageContentApiClient]
    override def getContentItem(content: Content, time: DateTime): ContentContainer = LiveContentItem(content, time)
  }

  test("processRecords waits for queue capacity before checkpointing the batch") {
    val actorSystem = ActorSystem("crier-processor-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val stream = new UsageGroupStream
    val (queue, sinkQueue) = stream.source.toMat(Sink.queue())(Keep.both).run()
    stream.attachQueue(queue)
    val marker = MarkerMap("test" -> "crier-processor")
    val queuedGroups = (1 to 256).map { id =>
      WithLogMarker(marker, UsageGroup(Set.empty, s"queued-$id", DateTime.now()))
    }
    val usageGroup = UsageGroup(Set.empty, "event-group", DateTime.parse("2026-11-01T12:00:00Z"))
    val content = Content.unsafeEmpty.copy(id = "content-id")
    val usageGroupOps = mock[UsageGroupOps]
    when(
      usageGroupOps.build(
        any[Content],
        org.mockito.ArgumentMatchers.eq(PublishedUsageStatus),
        any[DateTime],
        org.mockito.ArgumentMatchers.eq(false)
      )(any[com.gu.mediaservice.lib.logging.LogMarker])
    ).thenReturn(Some(usageGroup))
    val processor = new TestProcessor(usageGroupOps, stream)
    val checkpointer = mock[RecordProcessorCheckpointer]
    val event = Event(
      "payload-id",
      EventType.Update,
      ItemType.Content,
      usageGroup.lastModified.getMillis,
      Some(EventPayload.Content(content))
    )
    val record = KinesisClientRecord.builder()
      .sequenceNumber("sequence-1")
      .approximateArrivalTimestamp(Instant.now())
      .data(ThriftSerializer.serializeToBytes(event, None, None))
      .partitionKey("partition-1")
      .subSequenceNumber(0L)
      .build()
    val input = ProcessRecordsInput.builder()
      .cacheEntryTime(Instant.now())
      .cacheExitTime(Instant.now())
      .isAtShardEnd(false)
      .records(Collections.singletonList(record))
      .checkpointer(checkpointer)
      .millisBehindLatest(0L)
      .childShards(Collections.emptyList())
      .build()

    var processing: Option[Future[Unit]] = None

    try {
      val queuedOffers = queuedGroups.map(stream.publish)
      queuedOffers.exists(offer => !offer.isCompleted) shouldBe true

      val running = Future(processor.processRecords(input))
      processing = Some(running)

      verify(usageGroupOps, org.mockito.Mockito.timeout(5000)).build(
        any[Content],
        org.mockito.ArgumentMatchers.eq(PublishedUsageStatus),
        any[DateTime],
        org.mockito.ArgumentMatchers.eq(false)
      )(any[com.gu.mediaservice.lib.logging.LogMarker])
      intercept[java.util.concurrent.TimeoutException] {
        Await.result(running, 100.millis)
      }
      verify(checkpointer, never()).checkpoint("sequence-1", 0L)

      var pulls = 0
      while (!running.isCompleted && pulls < queuedGroups.size + 128) {
        Await.result(sinkQueue.pull(), 5.seconds)
        pulls += 1
      }
      Await.result(running, 5.seconds)
      verify(checkpointer).checkpoint("sequence-1", 0L)
    } finally {
      sinkQueue.cancel()
      processing.foreach(Await.ready(_, 5.seconds))
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }

  test("a failed checkpoint does not wedge subsequent processing attempts") {
    val actorSystem = ActorSystem("crier-checkpoint-retry-test")
    implicit val materializer = SystemMaterializer(actorSystem).materializer
    implicit val executionContext = actorSystem.dispatcher
    val usageGroupStream = mock[UsageGroupStream]
    val processor = new TestProcessor(mock[UsageGroupOps], usageGroupStream)
    val checkpointer = mock[RecordProcessorCheckpointer]
    val event = Event(
      "payload-id",
      EventType.Delete,
      ItemType.Content,
      DateTime.parse("2026-11-01T12:00:00Z").getMillis,
      None
    )
    val record = KinesisClientRecord.builder()
      .sequenceNumber("sequence-1")
      .approximateArrivalTimestamp(Instant.now())
      .data(ThriftSerializer.serializeToBytes(event, None, None))
      .partitionKey("partition-1")
      .subSequenceNumber(0L)
      .build()
    val input = ProcessRecordsInput.builder()
      .cacheEntryTime(Instant.now())
      .cacheExitTime(Instant.now())
      .isAtShardEnd(false)
      .records(Collections.singletonList(record))
      .checkpointer(checkpointer)
      .millisBehindLatest(0L)
      .childShards(Collections.emptyList())
      .build()

    try {
      doThrow(new IllegalStateException("temporary checkpoint failure"))
        .doNothing()
        .when(checkpointer)
        .checkpoint("sequence-1", 0L)

      intercept[IllegalStateException](processor.processRecords(input))
      processor.processRecords(input)

      verify(checkpointer, org.mockito.Mockito.times(2)).checkpoint("sequence-1", 0L)
    } finally {
      Await.result(actorSystem.terminate(), 5.seconds)
    }
  }
}
