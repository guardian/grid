package lib.kinesis

import java.util.UUID

import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.model.usage.UsageNotice
import com.gu.mediaservice.model.{Edits, ImageMetadata}
import com.gu.mediaservice.syntax.MessageSubjects
import lib.{MetadataEditorNotifications, ThrallStore}
import lib.elasticsearch.{ElasticSearchTestBase, ElasticSearchUpdateResponse}
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
      metadataEditorNotifications = mock[MetadataEditorNotifications])

      // tests here were specific to syndication rights, and have been deleted.

  }
  private def now = DateTime.now(DateTimeZone.UTC)
}
