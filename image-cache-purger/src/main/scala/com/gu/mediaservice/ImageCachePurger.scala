package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}

class ImageCachePurger extends RequestHandler[SQSEvent, String] {
  override def handleRequest(input: SQSEvent, context: Context): String = {

    context.getLogger.log("Image cache purge requested")
    "Image cache purge requested"
  }
}

