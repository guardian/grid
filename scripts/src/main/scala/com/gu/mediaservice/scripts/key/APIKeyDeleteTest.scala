package com.gu.mediaservice.scripts.key

import java.net.URI
import java.net.http.{HttpClient, HttpRequest}

object APIKeyDeleteTest extends App {

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val GRIDKEY_ADMIN = sys.env.getOrElse("GRIDKEY_ADMIN", throw new RuntimeException("Must set a GRIDKEY_V2_EXPIRED env variable"))
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

  deleteImage(GRIDKEY,  "3c78f994f9e2c308ec80dfa23de13615751a9b0f")
  deleteImage(GRIDKEY_ADMIN, "0cbc02faffaddfa1e1c8ec27945c7da55827dc2a")

  println("DONE")
}
