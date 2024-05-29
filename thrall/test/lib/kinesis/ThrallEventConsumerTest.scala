package lib.kinesis

import org.scalatest.EitherValues
import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper
import org.scalatestplus.mockito.MockitoSugar

class ThrallEventConsumerTest extends AnyFreeSpec with MockitoSugar with EitherValues {

  "parse message" - {
    "parse minimal message" in {
      val j =
        """
          |{
          | "subject":"delete-image",
          | "id":"123",
          | "lastModified":"2021-01-25T10:21:18.006Z",
          | "instance": {
          |   "id": "an-instance"
          | }
          |}
          |""".stripMargin.getBytes()
      val m2 = ThrallEventConsumer.parseRecord(j, java.time.Instant.EPOCH)
      m2.isRight shouldEqual (true)
      m2.value.subject shouldBe "DeleteImageMessage"
    }
  }
}

