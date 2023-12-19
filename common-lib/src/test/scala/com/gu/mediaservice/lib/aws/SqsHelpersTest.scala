package com.gu.mediaservice.lib.aws

import org.scalatest.funsuite.AnyFunSuiteLike
import com.amazonaws.services.sqs.model.{Message => SQSMessage}
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper

import scala.io.Source
import scala.util.Success


class SqsHelpersTest extends AnyFunSuiteLike with SqsHelpers {

  test("extractS3KeyFromSqsMessage") {

    val message = new SQSMessage()
    message.setBody(Source.fromResource("s3SqsMessage.json").mkString)

    extractS3KeyFromSqsMessage(message) shouldBe Success("bill.bloggs@example.co.uk/0cd747d665e2c59e86d256e6f45c369664e558bd")
  }

}
