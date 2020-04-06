package lib.kinesis

import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.aws.Kinesis
import com.gu.mediaservice.lib.aws.KinesisSenderConfig
import lib.ThrallStreamProcessor
import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import lib.KinesisReceiverConfig
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration

class KinesisTest extends KinesisTestBase {
  private implicit val actorSystem = ActorSystem()
  private val materializer = ActorMaterializer()

  val lowPrioritySender = getSenderConfig(lowPriorityStreamName)
  val hightPrioritySender = getSenderConfig(highPriorityStreamName)

  def getSenderConfig(streamName: String): ThrallMessageSender = {
    val config = new KinesisSenderConfig(region, staticCredentials, kinesisTestUrl, streamName)
    new ThrallMessageSender(config)
  }

  def getReceiverConfig(streamName: String): KinesisClientLibConfiguration  = {
    val config = new KinesisReceiverConfig(
      streamName,
      None,
      "eu-west-1",
      "stream-endpoint",
      "dynamo-endpoint",
      staticCredentials
    )
    KinesisConfig.kinesisConfig(config)
  }

  val highPriorityKinesisConfig = getReceiverConfig(highPriorityStreamName)
  val lowPriorityKinesisConfig = getReceiverConfig(lowPriorityStreamName)
  val mockConsumer = mock[ThrallEventConsumer]
  val streamProcessor = new ThrallStreamProcessor(highPriorityKinesisConfig, lowPriorityKinesisConfig, mockConsumer, actorSystem, materializer)

  describe("Example test") {
    it("should run once everything is ready") {
      println("Executing tests")
      true shouldBe true
    }
  }
}
