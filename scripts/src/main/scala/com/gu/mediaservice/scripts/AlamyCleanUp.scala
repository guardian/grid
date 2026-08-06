package com.gu.mediaservice.scripts

import play.libs.ws.WSClient

import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import scala.io.Source

object AlamyCleanUp extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  println(s"Running for stage ${STAGE}")
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  println(s"Using DOMAIN $GRIDDOMAIN")
  val ids = if(STAGE == "PROD") {
    println("Running with prod data")
    val resource = Source.fromResource("alamy-grid-ids.csv")
    resource.getLines().toList
  } else {
    println("Running with test data")
    List("3b2a8f1845359b84c805634fada85f008e6be297", "278c8c9801a5c8da10f07297289cc3eb26d16ff7", "fd41ca6b9b4ba27cef603bfd127841f6bf537f90")
  }
  println(s"Running for ${ids.size} ids")
  val requestBody = BodyPublishers.ofString("""{"data":{"restrictions":"No longer available from Alamy","category":"chargeable"}}""")

  val outcomes = ids.zipWithIndex.map({case (id, index) =>
    println(s"Running for id $id, ${index + 1} of ${ids.size}")
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
