package com.gu.mediaservice.scripts

import play.api.libs.json.{JsValue, Json}

import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import scala.io.Source

object AlamyCleanUp extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  val supplierRefs = if (STAGE == "PROD") {
    val csvPath = args.headOption.getOrElse {
      throw new IllegalArgumentException("Usage: AlamyCleanUp <csv-file>")
    }
    val source = Source.fromFile(csvPath)
    try {
      source
        .getLines()
        .drop(1)
        .map(_.takeWhile(_ != ',').trim)
        .filter(_.nonEmpty)
        .toList
    } finally {
      source.close()
    }
  } else {
    List("2BW0WK7", "AA63AP", "F208HC", "D9CNPG")
  }

  if (supplierRefs.isEmpty) {
    println("No supplier refs found in alamy-refs.csv, exiting script")
    sys.exit(1)
  }

  val ids = {
    supplierRefs.zipWithIndex.flatMap({case (ref, index) =>
      println(s"Fetching grid ids, checking supplierRef ${index + 1} of ${supplierRefs.size}")
      val client = HttpClient.newHttpClient()
      val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images?q=suppliersReference%3A$ref")).headers("X-Gu-Media-Key", GRIDKEY).build()
      val response = client.send(request, BodyHandlers.ofString())
      val json = Json.parse(response.body())
      (json \ "data").as[Seq[JsValue]].map(imageMetadata => (imageMetadata \ "data" \ "id").as[String])
    })
  }

  if (ids.isEmpty) {
    println("No Grid ids found, exiting script")
    sys.exit(1)
  }

  println(s"Found ${ids.size} ids, now running deletion")

  val usagesBody = BodyPublishers.ofString("""{"data":{"restrictions":"No longer available from Alamy","category":"chargeable"}}""")
  val labelBody = BodyPublishers.ofString("""{"data":["a2g"]}""")
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
        println(s"Unable to delete $id, setting usages and labels instead")
        val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$id/usage-rights"))
          .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(usagesBody).build()
        val response = client.send(request, BodyHandlers.ofString())
        if(response.statusCode() == 200) {
          println(s"Successfully set usage rights for $id")
          val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$id/labels"))
            .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").POST(labelBody).build()
          val response = client.send(request, BodyHandlers.ofString())
          if(response.statusCode() == 200) {
            println(s"Successfully set a label for $id")
            true
          }
          else {
            println(s"Unable to set label for $id, received response ${response.statusCode()}")
            false
          }
        } else {
          println(s"Unable to set usage rights for $id, received response ${response.statusCode()}")
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
