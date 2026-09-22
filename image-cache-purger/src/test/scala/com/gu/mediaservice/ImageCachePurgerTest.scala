package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, LambdaLogger}
import org.mockito.Mockito.{verify, when}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import scala.jdk.CollectionConverters._
import scala.io.Source
import scala.util.Using

class ImageCachePurgerTest extends AnyFunSpec with Matchers with MockitoSugar {
  private val messageBody = Using.resource(Source.fromResource("s3-event.json"))(_.mkString)
  private val expectedKey = "e3b4e3c7065a6a3f0b6f6ba0280eee6532dd4284/0_0_2000_3000/333.jpg"

  describe("ImageCachePurger") {
	it("extracts the object key from an S3 event") {
	  ImageCachePurger.extractKeys(messageBody) shouldBe List(expectedKey)
	}

	it("purges extracted S3 object keys from Fastly") {
	  val apiKeyProvider = mock[FastlyApiKeyProvider]
	  when(apiKeyProvider.apiKey).thenReturn("the-api-key")
	  val fastlyPurger = mock[FastlyPurger]
	  val logger = mock[LambdaLogger]
	  val context = mock[Context]
	  when(context.getLogger).thenReturn(logger)

	  val record = new SQSEvent.SQSMessage()
	  record.setBody(messageBody)
	  val event = new SQSEvent()
	  event.setRecords(List(record).asJava)

	  val result = new ImageCachePurger(apiKeyProvider, fastlyPurger).handleRequest(event, context)

	  result shouldBe "Image cache purge requested"
	  verify(fastlyPurger).purge(expectedKey, "the-api-key")
	  verify(logger).log(s"Purged S3 object key from Fastly: $expectedKey")
	}
  }
}
