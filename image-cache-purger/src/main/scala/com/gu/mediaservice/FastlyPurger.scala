package com.gu.mediaservice


import java.net.URI
import java.net.http.{HttpClient, HttpRequest}

class FastlyPurger(apiKeyProvider: FastlyApiKeyProvider, stage: String) {

  private val iGuimCoUk = "1L0HRheo6sMtfQHnY1FU6C"
  private val iGuimCodeCoUk = "5CSDV7WcKwnIIHipZzt3po"

  private val fastlyIOService = if (stage == "PROD") iGuimCoUk else iGuimCodeCoUk

  private lazy val httpClient: HttpClient = HttpClient.newHttpClient()

  def purge(key: String): Unit = {
    val apiKey = apiKeyProvider.apiKey
    val builder = HttpRequest.newBuilder()
      .uri(new URI(s"https://api.fastly.com/service/$fastlyIOService/purge/img/media/$key"))
      .headers("Fastly-Key", apiKey)
      .POST(HttpRequest.BodyPublishers.noBody())
      .build()

    val response = httpClient.send(builder, java.net.http.HttpResponse.BodyHandlers.ofString())
    response.statusCode() match {
      case 200 => println(s"Purge successful for url: https://i.guimcode.co.uk/img/media/$key")
      case _ => throw new RuntimeException(s"Failed to purge $key from Fastly: ${response.body()}")
    }
  }
}
