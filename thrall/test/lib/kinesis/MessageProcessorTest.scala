package lib.kinesis

import com.gu.mediaservice.lib.logging.MarkerMap
import com.gu.mediaservice.syntax.MessageSubjects
import lib.elasticsearch.ElasticSearchTestBase
import lib.{MetadataEditorNotifications, ThrallStore}
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.mockito.MockitoSugar


class MessageProcessorTest extends ElasticSearchTestBase with MessageSubjects with MockitoSugar {
  implicit val logMarker: MarkerMap = MarkerMap()
  "MessageProcessor" - {
    val messageProcessor = new MessageProcessor(
      es = ES,
      store = mock[ThrallStore],
      metadataEditorNotifications = mock[MetadataEditorNotifications]
    )

      // tests here were specific to syndication rights, and have been deleted.

  }
  private def now = DateTime.now(DateTimeZone.UTC)
}
