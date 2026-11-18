package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.lib.auth.ApiAccessor
import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.{HttpClient, HttpRequest}

object ApiKeyV2Test extends App {

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val GRIDKEY_EXP = sys.env.getOrElse("GRIDKEY_EXP", throw new RuntimeException("Must set a GRIDKEY_V2_EXPIRED env variable"))
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
  def callGridWithKey(apiKey: String, keyType: String, imageId: String): Unit = {
    println(s"READING IMAGE WITH API KEY $keyType")
    val status = getImageMetadata(imageId, apiKey)
    println(s"READING IMAGE WITH API KEY $keyType returns $status")
  }

  def printKeyContents(apiKey: String): Unit = {
    val contents = s3.getKey(apiKey)
    val apiAccessor = ApiAccessor(contents)
    println(s"API KEY $apiKey has identity ${apiAccessor.identity} and tier ${apiAccessor.tier} and expiry ${apiAccessor.expiry}")
  }

  printKeyContents(GRIDKEY)
  printKeyContents(GRIDKEY_EXP)

  callGridWithKey(GRIDKEY, "NON_EXPIRED", "463459c6102fd15cffc371350f07127c1777f18b")
  callGridWithKey(GRIDKEY_EXP, "EXPIRED", "bdde544034719307b111fd13ff1a992da6e23914")

  println("DONE")
}
