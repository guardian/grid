package lib.kinesis

import com.gu.mediaservice.lib.aws.UpdateMessage
import lib.elasticsearch.ElasticSearchTestBase
import org.scalatest.mockito.MockitoSugar
import play.api.libs.json.Json

class ThrallEventConsumerTest extends ElasticSearchTestBase with MockitoSugar {
  "parse message" - {
    "parse minimal message" in {
      val j =
        """
          |{
          | "subject":"test"
          |}
          |""".stripMargin.getBytes()
      val m2 = ThrallEventConsumer.parseRecord(j, java.time.Instant.EPOCH)
      m2.isRight shouldEqual (true)
      m2.right.get.subject shouldBe "test"
    }
    "parse near minimal message" in {
      val j =
        """
          |{
          | "subject":"test",
          | "lastModified":"2021-01-25T10:21:18.006Z"
          |}
          |""".stripMargin.getBytes()
      val m2 = ThrallEventConsumer.parseRecord(j, java.time.Instant.EPOCH)
      m2.isRight shouldEqual (true)
      m2.right.get.subject shouldBe "test"
    }
  }
}

