package com.gu.mediaservice.scripts.key

import java.net.URI
import java.net.http.{HttpClient, HttpRequest}

object APIKeyDeleteTest extends App {

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val GRIDKEY_ADMIN = sys.env.getOrElse("GRIDKEY_ADMIN", throw new RuntimeException("Must set a GRIDKEY_ADMIN env variable"))
  val STAGE = "TEST"
  val GRIDDOMAIN = if (STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  val client: HttpClient = HttpClient.newHttpClient()

  def deleteImage(apiKey: String, imageId: String)= {
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$imageId"))
      .headers("X-Gu-Media-Key", apiKey)
      .DELETE()
      .build()
    val statusCode = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()
    println(s"DELETE IMAGE $imageId WITH API KEY $apiKey returns $statusCode")
  }

  def addLabel(apiKey: String, imageId: String, label: String)= {
    val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$imageId/labels"))
      .headers("X-Gu-Media-Key", apiKey, "Content-Type", "application/json")
      .POST(java.net.http.HttpRequest.BodyPublishers.ofString(s"""{"data":["$label"]}"""))
      .build()
    val response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString())
    println(s"ADD LABEL $label TO IMAGE $imageId WITH API KEY $apiKey returns ${response.statusCode()}")
  }

  addLabel(GRIDKEY,  "3c78f994f9e2c308ec80dfa23de13615751a9b0f", "test-label")
  addLabel(GRIDKEY_ADMIN, "ce6d5544a25d527614727863f8d2e26748b5e764", "test-label")
  deleteImage(GRIDKEY,  "97bdadf48abd0887ccd071e14b1ced5d93d1941b")
  deleteImage(GRIDKEY_ADMIN, "37eb2b4f8c7bef8f4bc92fcdf79107419c9727f1")

  println("DONE")
}
