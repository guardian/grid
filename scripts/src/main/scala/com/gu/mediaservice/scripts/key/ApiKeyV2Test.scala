package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth.ApiAccessor
import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.{HttpClient, HttpRequest}

object ApiKeyV2Test extends App {

  val GRIDKEY_V1 = sys.env.getOrElse("GRIDKEY_V1", throw new RuntimeException("Must set a GRIDKEY_V1 env variable"))
  val GRIDKEY_V2 = sys.env.getOrElse("GRIDKEY_V2", throw new RuntimeException("Must set a GRIDKEY_V2 env variable"))
  val GRIDKEY_V2_EXPIRED = sys.env.getOrElse("GRIDKEY_V2_EXPIRED", throw new RuntimeException("Must set a GRIDKEY_V2_EXPIRED env variable"))
  val STAGE = "TEST"
  val GRIDDOMAIN = if (STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  val client: HttpClient = HttpClient.newHttpClient()
  val s3 = new S3("media-service-test-keybucket-10m1zzwqi73xd")

  def getImageMetadata(imageId: String, apiKey: String)= {
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$imageId"))
      .headers("X-Gu-Media-Key", apiKey)
      .GET()
      .build()
    client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()

  }
  def callGridWithKey(apiKey: String, version: String, imageId: String): Unit = {
    println(s"READING IMAGE WITH API KEY $version")
    val status = getImageMetadata(imageId, apiKey)
    println(s"READING IMAGE WITH API KEY $version returns $status")
  }

  def printKeyContents(apiKey: String): Unit = {
    val contents = s3.getKey(apiKey)
    val apiAccessor = ApiAccessor(contents)
    println(s"API KEY $apiKey has identity ${apiAccessor.identity} and tier ${apiAccessor.tier} and expiry ${apiAccessor.expiry}")
  }
  
  printKeyContents(GRIDKEY_V1)
  printKeyContents(GRIDKEY_V2)
  printKeyContents(GRIDKEY_V2_EXPIRED)

  callGridWithKey(GRIDKEY_V1, "V1", "463459c6102fd15cffc371350f07127c1777f18b")
  callGridWithKey(GRIDKEY_V2, "V2", "5634ae1136f1a4ffd0deccdd2320d8ba4ff49c69")
  callGridWithKey(GRIDKEY_V2_EXPIRED, "V2_EXPIRED", "bdde544034719307b111fd13ff1a992da6e23914")

  println("DONE")
}
