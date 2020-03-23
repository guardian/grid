package lib.kinesis

import java.util.UUID

import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.model.usage.UsageNotice
import com.gu.mediaservice.model._
import lib.{BulkIndexS3Client, MetadataEditorNotifications, ThrallStore}
import lib.elasticsearch.{ElasticSearchNoopResponse, ElasticSearchTestBase, ElasticSearchUpdateResponse, SyndicationRightsOps}
import org.joda.time.DateTime
import org.scalatest.mockito.MockitoSugar
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.{Await, Future}
import scala.util.{Success, Try}


class MessageProcessorTest extends ElasticSearchTestBase with MockitoSugar {
  "MessageProcessor" - {
    val messageProcessor = new MessageProcessor(
      es = ES,
      store = mock[ThrallStore],
      metadataEditorNotifications = mock[MetadataEditorNotifications],
      syndicationRightsOps = mock[SyndicationRightsOps],
      bulkIndexS3Client = mock[BulkIndexS3Client])

    "reingest-image" - {

      "adds an image as usual" in {
        val image = createImage("example-image", StaffPhotographer("Bruce Wayne", "Wayne Enterprises"))
        val expected = Success(List(ElasticSearchUpdateResponse()))
        val message = UpdateMessage(
          "reingest-image",
          image = Some(image)
        )

        Try(Await.result(messageProcessor.reingestImage(message), fiveSeconds)) shouldBe expected

        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(image.id).map(_.id) shouldBe Some(image.id))
      }

      "does not add an image if it is already present in ElasticSearch" in {
        val image = createImage("example-image-2", StaffPhotographer("Bruce Wayne", "Wayne Enterprises"))
        Await.result(Future.sequence(ES.indexImage(image.id, Json.toJson(image))), fiveSeconds)
        val expected = Success(ElasticSearchNoopResponse())

        val message = UpdateMessage(
          "reingest-image",
          image = Some(image)
        )

        Try(Await.result(messageProcessor.reingestImage(message), fiveSeconds)) shouldBe expected
      }
    }

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
          (Try(Await.result(messageProcessor.updateImageUsages(message), fiveSeconds))  ) shouldBe expected
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
         Try(Await.result(messageProcessor.updateImageUsages(message), fiveSeconds))  shouldBe expected
        }
      }
    }
  }
}
