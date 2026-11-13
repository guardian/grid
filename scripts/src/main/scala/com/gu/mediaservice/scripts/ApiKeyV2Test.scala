package com.gu.mediaservice.scripts


import java.net.URI
import java.net.http.{HttpClient, HttpRequest}
import java.net.http.HttpRequest.BodyPublishers

object ApiKeyV2Test extends App {

  val GRIDKEY_V1 = sys.env.getOrElse("GRIDKEY_V1", throw new RuntimeException("Must set a GRIDKEY_V1 env variable"))
  val GRIDKEY_V2 = sys.env.getOrElse("GRIDKEY_V2", throw new RuntimeException("Must set a GRIDKEY_V2 env variable"))
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

  def runWithKey(apiKey: String, version: String, imageId: String): Unit = {
    println(s"READING IMAGE WITH API KEY $version")
    val status = getImageMetadata(imageId, apiKey)
    println(status)
    println(s"UPDATING IMAGE WITH API KEY $version")
    val updateStatus = updateImageMetadata(imageId, """{ "data": { "byline": "New Byline"}}""", apiKey)
    println(updateStatus)
  }

  runWithKey(GRIDKEY_V1, "V1", "463459c6102fd15cffc371350f07127c1777f18b")
  runWithKey(GRIDKEY_V2 , "V2", "5634ae1136f1a4ffd0deccdd2320d8ba4ff49c69")
  println("DONE")

}
