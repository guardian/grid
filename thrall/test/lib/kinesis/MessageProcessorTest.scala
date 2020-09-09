package lib.kinesis

import java.util.UUID

import com.gu.mediaservice.lib.aws.{BulkIndexRequest, UpdateMessage}
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import com.gu.mediaservice.model.{Collection, Crop, Edits, Image, ImageMetadata, SyndicationRights}
import lib.{MetadataEditorNotifications, ThrallStore}
import lib.elasticsearch.{ElasticSearchTestBase, ElasticSearchUpdateResponse, SyndicationRightsOps}
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.{Await, Future}
import scala.util.{Success, Try}


class MessageProcessorTest extends ElasticSearchTestBase with MockitoSugar {
  implicit val logMarker = MarkerMap()
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

          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).
            copy(userMetadata = userMetadata)

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val message = UpdateMessage(
            "update-image-usages",
            image = None,
            id = Some(id),
            usageNotice = Some(UsageNotice(id, JsArray())),
            edits = None,
            lastModified = Some(new DateTime()),
            collections = None,
            leaseId = None,
            crops = None,
            mediaLease = None,
            leases = None,
            syndicationRights = None,
            bulkIndexRequest = None
          )
          (Try(Await.result(messageProcessor.updateImageUsages(message, logMarker), fiveSeconds))  ) shouldBe expected
        }
        "not crash for an image that doesn't exist 👻🖼" in {
          val expected: Success[List[ElasticSearchUpdateResponse]] = Success(List(ElasticSearchUpdateResponse()))
          val id = UUID.randomUUID().toString

          val message = UpdateMessage(
            "update-image-usages",
            image = None,
            id = Some(id),
            usageNotice = Some(UsageNotice(id, JsArray())),
            edits = None,
            lastModified = Some(new DateTime()),
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
}
