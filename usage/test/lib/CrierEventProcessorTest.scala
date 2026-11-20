package lib

import com.gu.contentapi.client.model.ItemQuery
import com.gu.contentapi.client.model.v1.{Content, ItemResponse}
import com.gu.crier.model.event.v1.{Event, EventPayload, EventType, ItemType, RetrievableContent}
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.usage.PublishedUsageStatus
import com.gu.thrift.serializer.ThriftSerializer
import model.{UsageGroup, UsageGroupOps}
import org.joda.time.DateTime
import org.mockito.ArgumentMatchers.{any, eq => eqTo}
import org.mockito.Mockito.{doAnswer, doThrow, never, times, verify, when}
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import software.amazon.kinesis.lifecycle.events.ProcessRecordsInput
import software.amazon.kinesis.processor.RecordProcessorCheckpointer
import software.amazon.kinesis.retrieval.KinesisClientRecord

import java.time.Instant
import java.util.concurrent.{CountDownLatch, TimeUnit}
import scala.collection.mutable.ListBuffer
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, Promise}
import scala.jdk.CollectionConverters._
import scala.util.Try

class CrierEventProcessorTest extends AnyFunSuite with Matchers with MockitoSugar {
  private val modified = DateTime.parse("2026-11-01T12:00:00Z")

  private class Fixture {
    val ops = mock[UsageGroupOps]
    val capi = mock[UsageContentApiClient]
    val checkpointer = mock[RecordProcessorCheckpointer]
    val delivered = ListBuffer.empty[String]
    var onDelivery: () => Unit = () => ()
    private val recorder: UsageGroupRecorder = group => Future.fromTry(Try {
      onDelivery()
      delivered += group.value.grouping
    })
    val processor = new CrierEventProcessor(mock[UsageConfig], ops, recorder) {
      override val contentApiClient: UsageContentApiClient = capi
      override def getContentItem(content: Content, time: DateTime): ContentContainer = LiveContentItem(content, time)
    }
    when(ops.build(any[Content], eqTo(PublishedUsageStatus), any[DateTime], eqTo(false))(any[LogMarker]))
      .thenAnswer(invocation => Some(UsageGroup(Set.empty, invocation.getArgument[Content](0).id, modified)))

    def record(sequenceNumber: String, event: Event): KinesisClientRecord =
      KinesisClientRecord.builder()
        .sequenceNumber(sequenceNumber)
        .subSequenceNumber(0L)
        .data(ThriftSerializer.serializeToBytes(event, None, None))
        .partitionKey("partition")
        .approximateArrivalTimestamp(Instant.now())
        .build()

    def runRecords(records: Seq[KinesisClientRecord]): Unit =
      processor.processRecords(ProcessRecordsInput.builder()
        .records(records.asJava)
        .checkpointer(checkpointer)
        .cacheEntryTime(Instant.now())
        .cacheExitTime(Instant.now())
        .millisBehindLatest(0L)
        .isAtShardEnd(false)
        .childShards(java.util.Collections.emptyList())
        .build())

    def run(ids: String*): Unit =
      runRecords(ids.map { id =>
        record(id, Event(id, EventType.Update, ItemType.Content, modified.getMillis,
          Some(EventPayload.Content(Content.unsafeEmpty.copy(id = id)))))
      })

    def observe(test: => Unit): Unit = test
  }

  test("a batch publishes its usage groups in record order before checkpointing the last record") {
    val f = new Fixture
    doAnswer(_ => {
      f.delivered.toList shouldBe List("first", "second")
      null
    }).when(f.checkpointer).checkpoint("second", 0L)

    f.observe { f.run("first", "second") }

    verify(f.checkpointer).checkpoint("second", 0L)
  }

  test("a failed checkpoint does not prevent processing the next batch") {
    val f = new Fixture
    doThrow(new IllegalStateException("checkpoint failed")).doNothing()
      .when(f.checkpointer).checkpoint("record", 0L)

    f.observe {
      intercept[IllegalStateException](f.run("record"))
      f.run("record")
    }

    f.delivered.toList shouldBe List("record", "record")
    verify(f.checkpointer, times(2)).checkpoint("record", 0L)
  }

  test("a batch does not checkpoint while its usage group is still being delivered") {
    val f = new Fixture
    val entered = new CountDownLatch(1)
    val release = new CountDownLatch(1)
    f.onDelivery = () => {
      entered.countDown()
      require(release.await(5, TimeUnit.SECONDS), "delivery was not released")
    }

    f.observe {
      val processing = Future(f.run("record"))(ExecutionContext.global)
      try {
        entered.await(5, TimeUnit.SECONDS) shouldBe true
        processing.isCompleted shouldBe false
        verify(f.checkpointer, never()).checkpoint("record", 0L)
      } finally {
        release.countDown()
        Await.result(processing, 5.seconds)
      }
      verify(f.checkpointer).checkpoint("record", 0L)
    }
  }

  test("a failed delivery prevents checkpointing the batch") {
    val f = new Fixture
    f.onDelivery = () => throw new IllegalStateException("delivery failed")

    f.observe {
      intercept[IllegalStateException](f.run("record"))
      verify(f.checkpointer, never()).checkpoint("record", 0L)
    }
  }

  test("a retrievable update completes before later records and before checkpointing") {
    val f = new Fixture
    val query = ItemQuery("retrievable")
    val queryStarted = new CountDownLatch(1)
    val response = Promise[ItemResponse]()
    when(f.capi.usageQuery("retrievable")).thenReturn(query)
    when(f.capi.getResponse(eqTo(query))(any(), any[ExecutionContext])).thenAnswer { _ =>
      queryStarted.countDown()
      response.future
    }
    val retrievable = f.record("first", Event(
      "retrievable",
      EventType.RetrievableUpdate,
      ItemType.Content,
      modified.getMillis,
      Some(EventPayload.RetrievableContent(RetrievableContent("retrievable", "https://capi/retrievable")))
    ))
    val inline = f.record("second", Event(
      "inline",
      EventType.Update,
      ItemType.Content,
      modified.getMillis,
      Some(EventPayload.Content(Content.unsafeEmpty.copy(id = "inline")))
    ))

    f.observe {
      val processing = Future(f.runRecords(Seq(retrievable, inline)))(ExecutionContext.global)
      try {
        queryStarted.await(5, TimeUnit.SECONDS) shouldBe true
        processing.isCompleted shouldBe false
        f.delivered.toList shouldBe empty
        verify(f.checkpointer, never()).checkpoint("second", 0L)
        response.trySuccess(ItemResponse.unsafeEmpty.copy(content = Some(Content.unsafeEmpty.copy(id = "retrievable"))))
        Await.result(processing, 5.seconds)
        f.delivered.toList shouldBe List("retrievable", "inline")
        verify(f.checkpointer).checkpoint("second", 0L)
      } finally {
        response.trySuccess(ItemResponse.unsafeEmpty.copy(content = None))
      }
    }
  }
}
