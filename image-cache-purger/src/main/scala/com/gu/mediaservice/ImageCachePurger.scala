package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}
import com.fasterxml.jackson.databind.ObjectMapper

import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import scala.jdk.CollectionConverters._

class ImageCachePurgerHandler extends RequestHandler[SQSEvent, String] {

  val imageCachePurger = new ImageCachePurger(new FastlyPurger(FastlyApiKeyProvider.default, sys.env.getOrElse("STAGE", "DEV")))

  override def handleRequest(input: SQSEvent, context: Context): String = {
    imageCachePurger.handleRecord(input)

    "Image cache purge requested"
  }
}

class ImageCachePurger(fastlyPurger: FastlyPurger) {
  def handleRecord(input: SQSEvent): Unit = {
    input.getRecords.asScala.foreach { record =>
      ImageCachePurger.extractKeys(record.getBody).foreach { key =>
        fastlyPurger.purge(key)
      }
    }
  }
}


object ImageCachePurger {
  private val objectMapper = new ObjectMapper()

  private[mediaservice] def extractKeys(messageBody: String): List[String] = {
    objectMapper.readTree(messageBody).path("Records").elements().asScala.map { record =>
      val key = record.path("s3").path("object").path("key").asText()
      URLDecoder.decode(key, StandardCharsets.UTF_8)
    }.toList
  }
}
