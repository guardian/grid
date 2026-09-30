package com.gu.mediaservice

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.util.logging.Logger
import scala.util.Try

class FastlyPurger private[mediaservice] (
  apiKeyProvider: FastlyApiKeyProvider,
  fastlyServiceId: String,
  mediaHost: String,
  send: HttpRequest => HttpResponse[String]
) {
  def this(apiKeyProvider: FastlyApiKeyProvider, fastlyServiceId: String, mediaHost: String) =
    this(apiKeyProvider, fastlyServiceId, mediaHost, FastlyPurger.send)

  private val logger = Logger.getLogger(classOf[FastlyPurger].getName)

  private[mediaservice] def purgeUrls(key: String): List[String] =
    List(
      s"https://api.fastly.com/service/$fastlyServiceId/purge//$key",
      s"https://api.fastly.com/purge/$mediaHost/$key"
    )

  def purge(key: String): Try[Unit] = Try {
    val apiKey = apiKeyProvider.apiKey
    purgeUrls(key).foreach { url =>
      val builder = HttpRequest.newBuilder()
        .uri(new URI(url))
        .headers("Fastly-Key", apiKey)
        .POST(HttpRequest.BodyPublishers.noBody())
        .build()

      val response = send(builder)
      response.statusCode() match {
        case 200 =>
          logger.info(s"Successfully purged $url from Fastly")
        case statusCode =>
          logger.severe(s"Failed to purge $url from Fastly: HTTP $statusCode")
          throw new RuntimeException(s"Failed to purge $key from Fastly: ${response.body()}")
      }
    }
  }
}

private object FastlyPurger {
  private lazy val httpClient: HttpClient = HttpClient.newHttpClient()

  private def send(request: HttpRequest): HttpResponse[String] =
    httpClient.send(request, HttpResponse.BodyHandlers.ofString())
}
