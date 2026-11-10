package com.gu.mediaservice.scripts


import java.net.URI
import java.net.http.{HttpClient, HttpRequest}
import java.net.http.HttpRequest.BodyPublishers

object ApiKeyV2Test extends App {

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = "TEST"
  val GRIDDOMAIN = if (STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  val client: HttpClient = HttpClient.newHttpClient()
  def getImageMetadata(imageId: String, apiKey: String)= {
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$imageId"))
      .headers("X-Gu-Media-Key", apiKey)
      .GET()
      .build()
    client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()

  }

  def updateImageMetadata(imageId: String, metadata: String, apiKey: String): Int = {
    val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$imageId/metadata"))
      .headers("X-Gu-Media-Key", apiKey, "Content-Type", "application/json")
      .PUT(BodyPublishers.ofString(metadata))
      .build()
    client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()
  }

  val status = getImageMetadata("463459c6102fd15cffc371350f07127c1777f18b", GRIDKEY)
  println(status)
  val updateStatus = updateImageMetadata("463459c6102fd15cffc371350f07127c1777f18b", """{ "data": { "byline": "New Byline"}}""", GRIDKEY)
  println(updateStatus)
}
