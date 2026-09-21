package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, LambdaLogger}
import org.mockito.Mockito.{verify, when}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.jdk.CollectionConverters._

class ImageCachePurgerTest extends AnyFunSpec with Matchers with MockitoSugar {
  describe("ImageCachePurger") {
	it("logs each SQS record") {
	  val logger = mock[LambdaLogger]
	  val context = mock[Context]
	  when(context.getLogger).thenReturn(logger)

	  val firstRecord = new SQSEvent.SQSMessage()
	  firstRecord.setBody("first message")
	  val secondRecord = new SQSEvent.SQSMessage()
	  secondRecord.setBody("second message")
	  val event = new SQSEvent()
	  event.setRecords(List(firstRecord, secondRecord).asJava)

	  val result = new ImageCachePurger().handleRequest(event, context)

	  result shouldBe "Image cache purge requested"
	  verify(logger).log("Received SQS message: first message")
	  verify(logger).log("Received SQS message: second message")
	}
  }
}

