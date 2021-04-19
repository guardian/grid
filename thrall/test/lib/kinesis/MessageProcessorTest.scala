package lib.kinesis

import java.util.UUID

import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage.UsageNotice
import com.gu.mediaservice.model.{Edits, ImageMetadata}
import com.gu.mediaservice.syntax.MessageSubjects
import lib.{MetadataEditorNotifications, ThrallStore}
import lib.elasticsearch.{ElasticSearchTestBase, ElasticSearchUpdateResponse, SyndicationRightsOps}
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.mockito.MockitoSugar
import play.api.libs.json.JsArray

import scala.concurrent.{Await, Future}
import scala.util.{Success, Try}


class MessageProcessorTest extends ElasticSearchTestBase with MessageSubjects with MockitoSugar {
  implicit val logMarker: MarkerMap = MarkerMap()
  "MessageProcessor" - {
    val messageProcessor = new MessageProcessor(
      es = ES,
      store = mock[ThrallStore],
      metadataEditorNotifications = mock[MetadataEditorNotifications],
      syndicationRightsOps = mock[SyndicationRightsOps])

    "usages" - {

      "adds usages" - {
        "for an image that exists" in {
          val expected: Success[List[ElasticSearchUpdateResponse]] = Success(List(ElasticSearchUpdateResponse()))

          val id = UUID.randomUUID().toString

          val userMetadata = Some(Edits(metadata = ImageMetadata(
            description = Some("My boring image"),
            title = Some("User supplied title"),
            subjects = List("foo", "bar"),
            specialInstructions = Some("Testing")
          )))

          val image = createImageForSyndication(id = UUID.randomUUID().toString, rightsAcquired = true, Some(DateTime.now()), None).
            copy(userMetadata = userMetadata)

          Await.result(Future.sequence(ES.indexImage(id, image, now)), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val message = UpdateMessage(
            UpdateImageUsages,
            image = None,
            id = Some(id),
            usageNotice = Some(UsageNotice(id, JsArray())),
            edits = None,
            collections = None,
            leaseId = None,
            crops = None,
            mediaLease = None,
            leases = None,
            syndicationRights = None,
            bulkIndexRequest = None
          )
          Try(Await.result(messageProcessor.updateImageUsages(message, logMarker), fiveSeconds)) shouldBe expected
        }
        "not crash for an image that doesn't exist 👻🖼" in {
          val expected: Success[List[ElasticSearchUpdateResponse]] = Success(List(ElasticSearchUpdateResponse()))
          val id = UUID.randomUUID().toString

          val message = UpdateMessage(
            UpdateImageUsages,
            image = None,
            id = Some(id),
            usageNotice = Some(UsageNotice(id, JsArray())),
            edits = None,
            collections = None,
            leaseId = None,
            crops = None,
            mediaLease = None,
            leases = None,
            syndicationRights = None,
            bulkIndexRequest = None
          )
         Try(Await.result(messageProcessor.updateImageUsages(message, logMarker), fiveSeconds))  shouldBe expected
        }
      }
    }
  }
  private def now = DateTime.now(DateTimeZone.UTC)
}
