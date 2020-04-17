package lib.kinesis

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.Sink
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration
import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import lib.{HighPriority, LowPriority, Priority, ThrallStreamProcessor}

import scala.collection.immutable
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
    Thread.sleep(2*1000)
  }

  describe("Stream merging strategy") {
    it("should process high priority events first") {
      val stream = streamProcessor.createStream()
      Thread.sleep(15*1000)
      val imageMessage = UpdateMessage("image")
      val updateUsageMessage = UpdateMessage("update-image-usages")

      publishFiveMessages(highPrioritySender, imageMessage)
      publishFiveMessages(lowPrioritySender, updateUsageMessage)
      publishFiveMessages(lowPrioritySender, updateUsageMessage)
      publishFiveMessages(highPrioritySender, imageMessage)
      Thread.sleep(5*1000)
      val prioritiesFromMessages: Seq[Priority] = Await.result(stream.take(20).runWith(Sink.seq), 5.minutes).map {
        case (taggedRecord, _, _) => {
          taggedRecord.record.markProcessed()
          taggedRecord.priority
        }
      }

      println(prioritiesFromMessages)
      prioritiesFromMessages.length shouldBe 20

      val split: List[Seq[Priority]] = prioritiesFromMessages.grouped(10).toList
      split.length shouldBe 2

      val firstHalf: Seq[Priority] = split.head
      val secondHalf: Seq[Priority] = split(1)

      firstHalf.head shouldBe HighPriority
      firstHalf.distinct.length shouldBe 1

      secondHalf.head shouldBe LowPriority
      secondHalf.distinct.length shouldBe 1
    }
  }
}
