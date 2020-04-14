package lib.kinesis

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Sink
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import lib.{HighPriority, LowPriority, ThrallStreamProcessor}

import scala.concurrent.Await
import scala.concurrent.duration._

class KinesisTest extends KinesisTestBase {
  private implicit val actorSystem: ActorSystem = ActorSystem()
  private implicit val materializer: ActorMaterializer = ActorMaterializer()

  // These are lazy to ensure that the stream is instantiated
  // via the base trait before we try to connect.
  lazy val lowPrioritySender: ThrallMessageSender = getSenderConfig(lowPriorityStreamName)
  lazy val highPrioritySender: ThrallMessageSender = getSenderConfig(highPriorityStreamName)
  lazy val highPriorityKinesisConfig: KinesisClientLibConfiguration = getReceiverConfig(highPriorityStreamName)
  lazy val lowPriorityKinesisConfig: KinesisClientLibConfiguration = getReceiverConfig(lowPriorityStreamName)
  lazy val mockConsumer: ThrallEventConsumer = mock[ThrallEventConsumer]
  lazy val streamProcessor = new ThrallStreamProcessor(highPriorityKinesisConfig, lowPriorityKinesisConfig, mockConsumer, actorSystem, materializer)

  private def publishFiveMessages(sender: ThrallMessageSender, message: UpdateMessage) = {
    for (i <- 1 to 5) {
      sender.publish(message.copy(id = Some(s"image-id-$i")))
    }
  }

  describe("Example test") {
    it("should process high priority events first") {
      val stream = streamProcessor.createStream()
      val future = stream.take(20).runWith(Sink.seq)

      publishFiveMessages(highPrioritySender, UpdateMessage("image", id = Some(s"image-id")))
      publishFiveMessages(lowPrioritySender, UpdateMessage("update-image-usages", id = Some(s"image-id")))
      publishFiveMessages(highPrioritySender, UpdateMessage("image", id = Some(s"image-id")))
      publishFiveMessages(lowPrioritySender, UpdateMessage("update-image-usages", id = Some(s"image-id")))

      val result = Await.result(future, 5.minutes).map { case (record, _, _) => record.priority }

      result.length shouldBe 20

      val firstHalf = result.take(10)
      val secondHalf = result.takeRight(10)

      firstHalf.distinct.length shouldBe 1
      firstHalf.distinct.head shouldBe HighPriority

      secondHalf.distinct.length shouldBe 1
      secondHalf.distinct.head shouldBe LowPriority
    }
  }
}
