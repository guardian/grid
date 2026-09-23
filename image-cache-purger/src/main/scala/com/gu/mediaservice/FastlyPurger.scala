package com.gu.mediaservice

import java.net.URI
import java.net.http.{HttpClient, HttpRequest}
import java.util.logging.Logger
import scala.util.Try

class FastlyPurger(apiKeyProvider: FastlyApiKeyProvider, stage: String) {
  private val logger = Logger.getLogger(classOf[FastlyPurger].getName)

  private val iGuimCoUk = "1L0HRheo6sMtfQHnY1FU6C"
  private val iGuimCodeCoUk = "5CSDV7WcKwnIIHipZzt3po"

  private val fastlyIOService = if (stage == "PROD") iGuimCoUk else iGuimCodeCoUk

  private lazy val httpClient: HttpClient = HttpClient.newHttpClient()

  def purge(key: String): Try[Unit] = Try {
    val apiKey = apiKeyProvider.apiKey
    val builder = HttpRequest.newBuilder()
      .uri(new URI(s"https://api.fastly.com/service/$fastlyIOService/purge/img/media/$key"))
      .headers("Fastly-Key", apiKey)
      .POST(HttpRequest.BodyPublishers.noBody())
      .build()

    val response = httpClient.send(builder, java.net.http.HttpResponse.BodyHandlers.ofString())
    response.statusCode() match {
      case 200 => logger.info(s"Successfully purged img/media/$key from Fastly")
      case statusCode =>
        logger.severe(s"Failed to purge img/media/$key from Fastly: HTTP $statusCode")
        throw new RuntimeException(s"Failed to purge $key from Fastly: ${response.body()}")
    }
  }
}
