package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.{Context, LambdaLogger}
import org.mockito.Mockito.{verify, when}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar

import java.util.Collections

class ImageCachePurgerTest extends AnyFunSpec with Matchers with MockitoSugar {
  describe("ImageCachePurger") {
	it("acknowledges and logs an invocation") {
	  val logger = mock[LambdaLogger]
	  val context = mock[Context]
	  when(context.getLogger).thenReturn(logger)

	  val result = new ImageCachePurger().handleRequest(Collections.emptyMap[String, Object](), context)

	  result shouldBe "Image cache purge requested"
	  verify(logger).log("Image cache purge requested")
	}
  }
}

