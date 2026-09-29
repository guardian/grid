package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.usage.Usage
import play.api.libs.json.{JsValue, Json}

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}

object EyeVine extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  val gridId = "ba4f7fcd346f6d6705fc37c3585fe3f32dc8f2ee"

  private def parseUsages(responseBody: String): List[Usage] =
    (Json.parse(responseBody) \ "data")
      .as[List[JsValue]]
      .map(entity => (entity \ "data").as[Usage])

  private def getUsages(gridId: String): List[Usage] = {
    val client = HttpClient.newHttpClient()
    val request = HttpRequest.newBuilder(new URI(s"https://media-usage.$GRIDDOMAIN/usages/media/$gridId")).headers("X-Gu-Media-Key", GRIDKEY).build()
    val response = client.send(request, HttpResponse.BodyHandlers.ofString())

    response.statusCode() match {
      case 200 => parseUsages(response.body())
      case 404 => Nil
      case statusCode => throw new RuntimeException(s"Usage API returned $statusCode: ${response.body()}")
    }
  }

  private def deleteUsage(gridId: String, usageId: String) = {
    val client = HttpClient.newHttpClient()
    val request = HttpRequest.newBuilder(new URI(s"https://media-usage.$GRIDDOMAIN/usages/media/$gridId/$usageId"))
      .headers("X-Gu-Media-Key", GRIDKEY)
      .DELETE()
      .build()
    val response = client.send(request, HttpResponse.BodyHandlers.ofString())

    response.statusCode() match {
      case 200 => println(s"Deleted usage $usageId")
      case 404 => println(s"Usage $usageId not found")
      case statusCode => throw new RuntimeException(s"Usage API returned $statusCode: ${response.body()}")
    }
  }
  private val usages = getUsages(gridId)
  println(s"Found ${usages.size} usages")
  usages.filter(u => u.platform.toString == "syndication").foreach { usage =>
    deleteUsage(gridId, usage.id)
  }
}
