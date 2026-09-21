package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}

class ImageCachePurger extends RequestHandler[SQSEvent, String] {
  override def handleRequest(input: SQSEvent, context: Context): String = {
    input.getRecords.foreach(record => context.getLogger.log(s"Received SQS message: ${record.getBody}").mkString("\n"))

    "Image cache purge requested"
  }
}

