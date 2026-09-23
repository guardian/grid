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
  private val imageHost = if (stage == "PROD") "i.guim.co.uk" else "i.guimcode.co.uk"

  def purge(key: String): Try[Unit] = Try {
    val apiKey = apiKeyProvider.apiKey
    val builder = HttpRequest.newBuilder()
      .uri(new URI(s"https://api.fastly.com/service/$fastlyIOService/purge/img/media/$key"))
      .headers("Fastly-Key", apiKey)
      .POST(HttpRequest.BodyPublishers.noBody())
      .build()

    val response = send(builder)
    response.statusCode() match {
      case 200 => logger.info(s"Successfully purged img/media/$key from Fastly")
      case statusCode =>
        logger.severe(s"Failed to purge img/media/$key from Fastly: HTTP $statusCode")
        throw new RuntimeException(s"Failed to purge $key from Fastly: ${response.body()}")
    }
  }

  def verifyPurge(key: String): Try[Unit] = Try {
    val request = HttpRequest.newBuilder(imageUri(key))
      .timeout(Duration.ofSeconds(10))
      .header("Fastly-Debug", "1")
      .GET()
      .build()
    val response = send(request)
    val xCache = headerTokens(response, "X-Cache")
    val xCacheHits = headerTokens(response, "X-Cache-Hits")
    val age = headerTokens(response, "Age")

    val isCacheMiss = xCache.nonEmpty && xCache.forall(_.equalsIgnoreCase("MISS"))
    val hasNoCacheHits = xCacheHits.nonEmpty && xCacheHits.forall(_ == "0")
    val hasNoAge = age.isEmpty || age.forall(_ == "0")

    if (!isCacheMiss || !hasNoCacheHits || !hasNoAge) {
      throw new RuntimeException(
        s"Fastly purge verification failed for img/media/$key: " +
          s"X-Cache=${xCache.mkString(",")}, X-Cache-Hits=${xCacheHits.mkString(",")}, Age=${age.mkString(",")}"
      )
    }

    logger.info(s"Verified img/media/$key was not served from the previous Fastly cache")
  }

  private def imageUri(key: String): URI = {
    val encodedKey = key.split("/", -1).map(segment =>
      java.net.URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20")
    ).mkString("/")
    URI.create(s"https://$imageHost/img/media/$encodedKey")
  }

  private def headerTokens(response: HttpResponse[_], name: String): List[String] =
    response.headers().allValues(name).asScala.toList.flatMap(_.split(",")).map(_.trim).filter(_.nonEmpty)
}

private object FastlyPurger {
  private lazy val httpClient: HttpClient = HttpClient.newHttpClient()

  private def send(request: HttpRequest): HttpResponse[String] =
    httpClient.send(request, HttpResponse.BodyHandlers.ofString())
}
