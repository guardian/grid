package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.scripts.AlamyCleanUp.{ids, outcomes}
import play.api.libs.json.{JsValue, Json}

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}

object EyeVine extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  val gridIds = List("ba4f7fcd346f6d6705fc37c3585fe3f32dc8f2ee")

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

  private def deleteUsage(gridId: String, usageId: String): Boolean = {
    val client = HttpClient.newHttpClient()
    val request = HttpRequest.newBuilder(new URI(s"https://media-usage.$GRIDDOMAIN/usages/media/$gridId/$usageId"))
      .headers("X-Gu-Media-Key", GRIDKEY)
      .DELETE()
      .build()
    val response = client.send(request, HttpResponse.BodyHandlers.ofString())

    response.statusCode() match {
      case 200 => {
        println(s"Deleted usage $usageId")
        true
      }
      case 404 => {
        println(s"Usage $usageId not found")
        false
      }
      case statusCode => {
        println(s"Error deleting usage $usageId: ${response.body()}")
        false
      }
    }
  }

  gridIds.foreach(gridId => {
    println(s"Fetching usages for $gridId")
    val syndicationUsages = getUsages(gridId).filter(u => u.platform.toString == "syndication")
    if(syndicationUsages.isEmpty) {
      println(s"No syndication usages found for $gridId")
    } else {
      println(s"Found ${syndicationUsages.size} syndication usages for $gridId")
    }
    syndicationUsages.foreach { usage =>
      println(s"Deleting usage ${usage.id} for $gridId")
      (deleteUsage(gridId, usage.id), gridId)
    }
  })
}
