package com.gu.mediaservice.scripts

import java.net.URI
import java.net.http.{HttpClient, HttpRequest}
import java.net.http.HttpResponse.BodyHandlers
import scala.io.Source

object BulkRemoveFromCollection extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  // Case-sensitive. For the nested collection Web News > test, the format would be: Web%20News/test
  val COLLECTION = sys.env.getOrElse("COLLECTION", throw new RuntimeException("Must set a COLLECTION env variable"))

  val ids = if(STAGE == "PROD") {
    val resource = Source.fromResource("remove-collection-grid-ids.csv")
    resource.getLines().toList
  } else {
    // Add test IDs to a collection before running to test the script
    List("f5f08f82492db26884fbb132bd25f007d0d97da7", "8dc44d419d2aa0ab4c8ebdfde9647888c1543f20", "dbaa480f3424cdd833a520bdff6b6f134282c524")
  }

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN with ${ids.size} ids")

  val outcomes = ids.zipWithIndex.map({case (id, index) =>
    println(s"Running for id $id, ${index + 1} of ${ids.size}")
    // Make an api request to try to remove the image from the collection
    val client = HttpClient.newHttpClient()
    val request = HttpRequest.newBuilder(new URI(s"https://media-collections.$GRIDDOMAIN/images/$id/$COLLECTION")).headers("X-Gu-Media-Key", GRIDKEY).DELETE().build()
    val response = client.send(request, BodyHandlers.ofString())
    val success: Boolean = response.statusCode() match {
      case 200 => {
        println(s"Successfully removed from collection: $id")
        true
      }
      case _ => {
        println(s"Got unexpected response ${response.statusCode()} trying to remove collection for ${id}")
        false
      }
    }
    (success, id)
  })

  val (success, fail) = outcomes.partition({case (b, _) => b})
  println(s"Successfully processed ${success.size} of  ${ids.size}")
  if(fail.nonEmpty) {
    println(s"Unable to process ${fail.size} ids: \n${fail.map(_._2).mkString("\n")}")
  }
}
