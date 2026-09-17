package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}

import java.util.{Map => JavaMap}

class ImageCachePurger extends RequestHandler[JavaMap[String, Object], String] {
  override def handleRequest(input: JavaMap[String, Object], context: Context): String = {
    context.getLogger.log("Image cache purge requested")
    "Image cache purge requested"
  }
}

