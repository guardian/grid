package lib.kinesis

import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.aws.Kinesis
import com.gu.mediaservice.lib.aws.KinesisSenderConfig
import lib.ThrallStreamProcessor
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import lib.KinesisReceiverConfig
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import akka.stream.scaladsl.Sink
import akka.pattern.pipe

import scala.concurrent.Await
import scala.concurrent.duration._
import com.gu.mediaservice.lib.aws.UpdateMessage

class KinesisTest extends KinesisTestBase {
  private implicit val actorSystem = ActorSystem()
  private implicit val materializer = ActorMaterializer()

  // These are lazy to ensure that the stream is instantiated
  // via the base trait before we try to connect.
  lazy val lowPrioritySender = getSenderConfig(lowPriorityStreamName)
  lazy val highPrioritySender = getSenderConfig(highPriorityStreamName)
  lazy val highPriorityKinesisConfig = getReceiverConfig(highPriorityStreamName)
  lazy val lowPriorityKinesisConfig = getReceiverConfig(lowPriorityStreamName)
  lazy val mockConsumer = mock[ThrallEventConsumer]
  lazy val streamProcessor = new ThrallStreamProcessor(highPriorityKinesisConfig, lowPriorityKinesisConfig, mockConsumer, actorSystem, materializer)

  describe("Example test") {

    it("is a test") {
      true shouldBe true
    }

    it("should take high-priority events from the stream") {
      val stream = streamProcessor.createStream()
      val future = stream.runWith(Sink.seq)
      for (i <- 1 to 10) {
        highPrioritySender.publish(UpdateMessage("image"))
      }
      for (i <- 1 to 10) {
        lowPrioritySender.publish(UpdateMessage("update-image-usages"))
      }
      val result = Await.result(future, 5.seconds)
      println(result)
    }
  }
}
