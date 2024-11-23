package lib.kinesis

import lib.elasticsearch.ElasticSearchTestBase
import org.scalatest.EitherValues
import org.scalatestplus.mockito.MockitoSugar

class ThrallEventConsumerTest extends ElasticSearchTestBase with MockitoSugar with EitherValues {
  "parse message" - {
    "parse minimal message" in {
      val j =
        """
          |{
          | "subject":"delete-image",
          | "id":"123",
          | "lastModified":"2021-01-25T10:21:18.006Z",
          | "instance":"an-instance"
          |}
          |""".stripMargin.getBytes()
      val m2 = ThrallEventConsumer.parseRecord(j, java.time.Instant.EPOCH)
      m2.isRight shouldEqual (true)
      m2.value.subject shouldBe "DeleteImageMessage"
    }
  }
}

