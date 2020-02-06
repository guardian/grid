package lib

import java.util.UUID

import com.gu.mediaservice.lib.aws.UpdateMessage
import lib.kinesis.MessageProcessor
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import org.mockito.Mockito._

import scala.concurrent.Await


class MessageProcessorTest extends ElasticSearchTestBase with MockitoSugar {
  val thrallConfig = mock[ThrallConfig]
  val thrallStore = mock[ThrallStore]
  val metadataEditorNotifications = mock[MetadataEditorNotifications]
  val syndicationRightsOps =mock[SyndicationRightsOps]

  "MessageProcessor" - {
    "chooses the correct handler function given a subject" in {

      // This is an integration test, because it's difficult to assert against function identities in Scala.
      // We're asserting that the message is processed in the appropriate way by ES.

      val messageProcessor = new MessageProcessor(ES, thrallStore, metadataEditorNotifications, syndicationRightsOps)

      val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
      val message = UpdateMessage("image", Some(image))

      val processor = messageProcessor.chooseProcessor(message).get
      Await.result(processor(message), fiveSeconds)

      reloadedImage(image.id).get.id shouldBe image.id
    }
  }
}
