package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent
import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}
import com.fasterxml.jackson.databind.ObjectMapper

import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import scala.jdk.CollectionConverters._

class ImageCachePurger private[mediaservice] (
  apiKeyProvider: FastlyApiKeyProvider,
  fastlyPurger: FastlyPurger
) extends RequestHandler[SQSEvent, String] {
  def this() = this(FastlyApiKeyProvider.default, FastlyPurger.default)

  override def handleRequest(input: SQSEvent, context: Context): String = {
    val apiKey = apiKeyProvider.apiKey

    input.getRecords.asScala.foreach { record =>
      ImageCachePurger.extractKeys(record.getBody).foreach { key =>
        fastlyPurger.purge(key, apiKey)
        context.getLogger.log(s"Purged S3 object key from Fastly: $key")
      }
    }

    "Image cache purge requested"
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
