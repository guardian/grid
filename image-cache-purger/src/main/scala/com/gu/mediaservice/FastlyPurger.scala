package com.gu.mediaservice

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.logging.Logger
import scala.jdk.CollectionConverters._
import scala.util.Try

class FastlyPurger private[mediaservice] (
  apiKeyProvider: FastlyApiKeyProvider,
  stage: String,
  send: HttpRequest => HttpResponse[String]
) {
  def this(apiKeyProvider: FastlyApiKeyProvider, stage: String) =
    this(apiKeyProvider, stage, FastlyPurger.send)

  private val logger = Logger.getLogger(classOf[FastlyPurger].getName)

  private val iGuimCoUk = "1L0HRheo6sMtfQHnY1FU6C"
  private val iGuimCodeCoUk = "5CSDV7WcKwnIIHipZzt3po"

  private val fastlyIOService = if (stage == "PROD") iGuimCoUk else iGuimCodeCoUk

  def purge(key: String): Try[Unit] = Try {
    val apiKey = apiKeyProvider.apiKey
    val builder = HttpRequest.newBuilder()
      .uri(new URI(s"https://api.fastly.com/service/$fastlyIOService/purge/img/media/$key"))
      .headers("Fastly-Key", apiKey)
      .POST(HttpRequest.BodyPublishers.noBody())
      .build()

    val response = send(builder)
    response.statusCode() match {
      case 200 =>
        logger.info(s"Successfully purged img/media/$key from Fastly")
      case statusCode =>
        logger.severe(s"Failed to purge img/media/$key from Fastly: HTTP $statusCode")
        throw new RuntimeException(s"Failed to purge $key from Fastly: ${response.body()}")
    }
  }
}

private object FastlyPurger {
  private lazy val httpClient: HttpClient = HttpClient.newHttpClient()

  private def send(request: HttpRequest): HttpResponse[String] =
    httpClient.send(request, HttpResponse.BodyHandlers.ofString())
}
