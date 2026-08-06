package com.gu.mediaservice.scripts

import play.libs.ws.WSClient

import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import scala.io.Source

object AlamyCleanUp extends App {
  val GRIDDOMAIN = "test.dev-gutools.co.uk"
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env varaible"))
  val resource = Source.fromResource("alamy-grid-ids.csv")
  val ids = resource.getLines().toList
  val requestBody = BodyPublishers.ofString("""{"data":{"restrictions":"No longer available from Alamy","category":"chargeable"}}""")
  
  val outcomes = ids.zipWithIndex.map({case (id, index) =>
    println(s"Running for id $id, $index of ${ids.size}")
    // Make an api request to try to delete the image, either successful or
    val client = HttpClient.newHttpClient()
    // attempt a hard delete
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$id")).headers("X-Gu-Media-Key", GRIDKEY).DELETE().build()
    val response = client.send(request, BodyHandlers.ofString())
    // check status response, if not 202
    // modify the usage rights
    val success: Boolean = response.statusCode() match {
      case 202 => {
        println(s"Successfully deleted $id")
        true
      }
      case 405 => {
        println(s"Unable to delete $id, setting usages instead")
        val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$id/usage-rights"))
          .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(requestBody).build()
        val response = client.send(request, BodyHandlers.ofString())
        if(response.statusCode() == 200) {
          println(s"Successfully set usage rights for $id")
          true
        } else {
          println(s"Unable to set usage rights for $id, recevied response ${response.statusCode()}")
          false
        }
      }
      case _ => {
        println(s"Got unexpected response ${response.statusCode()} calling delete for ${id}")
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
