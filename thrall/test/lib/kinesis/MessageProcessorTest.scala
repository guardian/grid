package lib.kinesis

import java.util.UUID

import com.gu.mediaservice.lib.aws.{BulkIndexRequest, UpdateMessage}
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.UsageNotice
import com.gu.mediaservice.model.{Collection, Crop, Edits, Image, ImageMetadata, SyndicationRights}
import lib.ThrallStore
import lib.elasticsearch.ElasticSearchTestBase
import org.joda.time.DateTime
import play.api.libs.json.{JsArray, Json}

import scala.concurrent.{Await, Future}


class MessageProcessorTest extends ElasticSearchTestBase {
  "MessageProcessor" - {
    val messageProcessor = new MessageProcessor(ES, new ThrallStore(???), ???, ???, ???)
    "usages" - {

      "adds usages" - {
        "for an image that exists" in {

          val id = UUID.randomUUID().toString

          val userMetadata = Some(Edits(metadata = ImageMetadata(
            description = Some("My boring image"),
            title = Some("User supplied title"),
            subjects = List("foo", "bar"),
            specialInstructions = Some("Testing")
          )))

          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).
            copy(userMetadata = userMetadata)

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds) // TODO why is index past in? Is it different to image.id and if so why?

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val message = UpdateMessage(
            "update-image-usages",
            image = None,
            id = Some(id),
            usageNotice = Some(UsageNotice(id, JsArray())),
            edits = None,
            lastModified = None,
            collections = None,
            leaseId = None,
            crops = None,
            mediaLease = None,
            leases = None,
            syndicationRights = None,
            bulkIndexRequest = None
          )
          val update = Await.result(messageProcessor.updateImageUsages(message),fiveSeconds)
          update.length shouldBe 1


        }
        "not for an image that doesn't exist 👻🖼" in {

          val id = UUID.randomUUID().toString

          val message = UpdateMessage(
            "update-image-usages",
            image = None,
            id = Some(id),
            usageNotice = Some(UsageNotice(id, JsArray())),
            edits = None,
            lastModified = None,
            collections = None,
            leaseId = None,
            crops = None,
            mediaLease = None,
            leases = None,
            syndicationRights = None,
            bulkIndexRequest = None
          )
          val update = Await.result(messageProcessor.updateImageUsages(message),fiveSeconds)
          update.length shouldBe 0


        }
      }
    }
  }
}
