package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}

import scala.jdk.CollectionConverters._

class ImageCachePurger extends RequestHandler[SQSEvent, String] {
  override def handleRequest(input: SQSEvent, context: Context): String = {
    input.getRecords.asScala.foreach { record =>
      context.getLogger.log(s"Received SQS message: ${record.getBody}")
    }

    "Image cache purge requested"
  }
}

