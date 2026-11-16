package lib

import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{reset, when}
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Seconds, Span}
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json

import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future, Promise}

class MetadataSqsMessageConsumerTest extends AnyFunSpec with Matchers with ScalaFutures with MockitoSugar with BeforeAndAfterAll with BeforeAndAfterEach {
  override implicit val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(5, Seconds))

  private val store: EditsStore = mock[EditsStore]
  private val consumer = new MetadataSqsMessageConsumer(mock[EditsConfig], mock[MetadataEditorMetrics], store)
  private val message = Json.obj("id" -> "image-id")

  override protected def beforeEach(): Unit = {
    super.beforeEach()
    reset(store)
  }

  override protected def afterAll(): Unit = {
    Await.result(consumer.actorSystem.terminate(), 5.seconds)
    super.afterAll()
  }

  describe("image deletion") {
    it("waits for the DynamoDB deletion before completing the processor") {
      val started = Promise[Unit]()
      val deletion = Promise[Unit]()
      when(store.deleteItem(any[String])(any[ExecutionContext])).thenAnswer { _ =>
        started.success(())
        deletion.future
      }

      val result = consumer.chooseProcessor("image-deleted").get(message)

      started.future.futureValue
      result.isCompleted shouldBe false
      deletion.success(())
      result.futureValue
    }

    it("propagates DynamoDB deletion failures") {
      val failure = new RuntimeException("delete failed")
      when(store.deleteItem(any[String])(any[ExecutionContext])).thenReturn(Future.failed(failure))

      consumer.chooseProcessor("image-deleted").get(message).failed.futureValue shouldBe failure
    }
  }
}
