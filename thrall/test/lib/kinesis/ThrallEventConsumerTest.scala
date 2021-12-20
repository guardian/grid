package lib.kinesis

import lib.elasticsearch.ElasticSearchTestBase
import org.scalatest.mockito.MockitoSugar

class ThrallEventConsumerTest extends ElasticSearchTestBase with MockitoSugar {
  "parse message" - {
    "parse minimal message" in {
      val j =
        """
          |{
          | "subject":"delete-image",
          | "id":"123",
          | "lastModified":"2021-01-25T10:21:18.006Z"
          |}
          |""".stripMargin.getBytes()
      val m2 = ThrallEventConsumer.parseRecord(j, java.time.Instant.EPOCH)
      m2.isRight shouldEqual (true)
      m2.right.get.subject shouldBe "DeleteImageMessage"
    }
  }
}

