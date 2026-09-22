package com.gu.mediaservice

import java.io.IOException
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.net.{URI, URLEncoder}
import java.nio.charset.StandardCharsets
import java.time.Duration

private[mediaservice] trait FastlyPurger {
  def purge(key: String, apiKey: String): Unit
}

private[mediaservice] trait HttpTransport {
  @throws[IOException]
  @throws[InterruptedException]
  def send(request: HttpRequest): Int
}

private[mediaservice] class JavaHttpTransport(client: HttpClient) extends HttpTransport {
  override def send(request: HttpRequest): Int =
    client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()
}

private[mediaservice] class HttpFastlyPurger(
  imageBaseUrl: URI,
  transport: HttpTransport
) extends FastlyPurger {
  override def purge(key: String, apiKey: String): Unit = {
    val request = HttpRequest.newBuilder(FastlyPurger.purgeUri(imageBaseUrl, key))
      .timeout(Duration.ofSeconds(10))
      .header("Fastly-Key", apiKey)
      .header("Accept", "application/json")
      .POST(HttpRequest.BodyPublishers.noBody())
      .build()

    val status = try transport.send(request) catch {
      case interrupted: InterruptedException =>
        Thread.currentThread().interrupt()
        throw interrupted
    }

    if (status < 200 || status >= 300) {
      throw new IOException(s"Fastly purge failed with HTTP status $status")
    }
  }
}

private[mediaservice] object FastlyPurger {
  private val ImageBaseUrlEnvironmentVariable = "FASTLY_IMAGE_BASE_URL"
  private val PurgeEndpoint = "https://api.fastly.com/purge/"

  lazy val default: FastlyPurger = fromEnvironment(sys.env, HttpClient.newBuilder()
    .connectTimeout(Duration.ofSeconds(5))
    .build())

  def fromEnvironment(environment: Map[String, String], client: => HttpClient): FastlyPurger = {
    val imageBaseUrl = environment.get(ImageBaseUrlEnvironmentVariable)
      .filter(_.trim.nonEmpty)
      .map(URI.create)
      .getOrElse(throw new IllegalStateException(s"$ImageBaseUrlEnvironmentVariable is not set"))

    require(imageBaseUrl.isAbsolute && imageBaseUrl.getScheme == "https", s"$ImageBaseUrlEnvironmentVariable must be an HTTPS URL")
    new HttpFastlyPurger(imageBaseUrl, new JavaHttpTransport(client))
  }

  private[mediaservice] def purgeUri(imageBaseUrl: URI, key: String): URI = {
    val encodedKey = key.split("/", -1).map(encode).mkString("/")
    val cachedUrl = s"${imageBaseUrl.toString.stripSuffix("/")}/$encodedKey"
    URI.create(s"$PurgeEndpoint${encode(cachedUrl)}")
  }

  private def encode(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")
}

