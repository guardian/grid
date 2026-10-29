package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.scripts.SupplierCleanUp.mediaIds
import play.api.libs.json.{JsValue, Json}

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import scala.io.Source

object EyeVine extends App {
  val options = args.flatMap(_.split("=", 2) match {
    case Array(name, value) => Some(name -> value)
    case _ => None
  }).toMap
  def required(name: String) = options.getOrElse(name, throw new IllegalArgumentException(s"Missing $name argument"))
  val GRIDKEY = required("GRIDKEY")
  val STAGE = required("STAGE")
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  // To create INPUT_FILE manually, search Gmail for "GNM Syndication Report", select the messages,
  // forward them to yourself as attachments, and download the ZIP. Extract it and run:
  // cat *.eml | grep 'Grid id:' | cut -w -f 3 > complete.txt
  val source = Source.fromFile(required("INPUT_FILE"))
  val gridIds = try source.getLines().toList finally source.close()

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
