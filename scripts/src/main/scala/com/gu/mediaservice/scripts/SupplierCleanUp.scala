package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.leases.MediaLease
import play.api.libs.json.{JsValue, Json}

import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import scala.io.Source

object SupplierCleanUp extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  def denyLeaseBody(mediaId: String) = {
    val mediaLease = MediaLease(
      id = None,
      leasedBy = None,
      startDate = None,
      endDate = None,
      access = com.gu.mediaservice.model.leases.DenyUseLease,
      notes = Some("No longer available from the supplier"),
      mediaId = mediaId
    )

    val js = Json.toJson[MediaLease](mediaLease)
    val leaseBody = BodyPublishers.ofString(s"""${js.toString()}""")
    leaseBody
  }

  val suppliersInTest = List("13300266")

  val supplierRefs = if (STAGE == "PROD") {
    val csvPath = args.headOption.getOrElse {
      throw new IllegalArgumentException("To run the script pass in a path to a csv file as an argument")
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
    suppliersInTest
  }
  println(s"Found ${supplierRefs.size} supplier refs to process")
  if (supplierRefs.isEmpty) {
    println("No supplier refs found in supplied csv, exiting script")
    sys.exit(1)
  }
  val mediaIds = {
    supplierRefs.grouped(1000).toList.zipWithIndex.flatMap{case (refs, index)=>
      println(s"Fetching grid ids, for batch ${index + 1} of ${supplierRefs.grouped(1000).size}")

      val ids = refs.flatMap(ref => {
        val client = HttpClient.newHttpClient()
        val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images?q=suppliersReference%3A$ref")).headers("X-Gu-Media-Key", GRIDKEY).build()
        val response = client.send(request, BodyHandlers.ofString())
        val json = Json.parse(response.body())
        val gridIds = (json \ "data").as[Seq[JsValue]].map(imageMetadata => (imageMetadata \ "data" \ "id").as[String])
        gridIds
      })
      println(s"Found ${ids.size} grid ids for batch ${index + 1} of ${supplierRefs.grouped(1000).size}")
      Thread.sleep(2000)
      ids
    }
  }

  if (mediaIds.isEmpty) {
    println("No Grid ids found, exiting script")
    sys.exit(1)
  }

  println(s"Found ${mediaIds.size} ids, now running deletion")

  val usagesBody = BodyPublishers.ofString("""{"data":{"restrictions":"No longer available from the supplier","category":"chargeable"}}""")

  val outcomes = mediaIds.zipWithIndex.map({case (mediaId, index) =>
    println(s"Running for id $mediaId, ${index + 1} of ${mediaIds.size}")
    // Make an api request to try to delete the image, either successful or
    val client = HttpClient.newHttpClient()
    // attempt a hard delete
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$mediaId")).headers("X-Gu-Media-Key", GRIDKEY).DELETE().build()
    val response = client.send(request, BodyHandlers.ofString())
    // check status response, if not 202
    // modify the usage rights
    val success: Boolean = response.statusCode() match {
      case 202 => {
        println(s"Successfully deleted $mediaId")
        true
      }
      case 405 => {
        println(s"Unable to delete $mediaId, setting usages and labels instead")
        val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$mediaId/usage-rights"))
          .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(usagesBody).build()
        val response = client.send(request, BodyHandlers.ofString())
        if(response.statusCode() == 200) {
          println(s"Successfully set usage rights for $mediaId")
          val request = HttpRequest.newBuilder(new URI(s"https://media-leases.$GRIDDOMAIN/leases"))
            .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").POST(denyLeaseBody(mediaId)).build()
          val response = client.send(request, BodyHandlers.ofString())
          if(response.statusCode() == 202) {
            println(s"Successfully set a deny-lease for $mediaId")
            true
          }
          else {
            println(s"Unable to set deny-lease for $mediaId, received response ${response.statusCode()}")
            println(s"Response body: ${response.body()}")
            false
          }
        } else {
          println(s"Unable to set usage rights for $mediaId, received response ${response.statusCode()}")
          false
        }
      }
      case _ => {
        println(s"Got unexpected response ${response.statusCode()} calling delete for ${mediaId}")
        false
      }
    }
    (success, mediaId)
  })

  val (success, fail) = outcomes.partition({case (b, _) => b})
  println(s"Successfully processed ${success.size} of  ${mediaIds.size}")
  if(fail.nonEmpty) {
    println(s"Unable to process ${fail.size} ids: \n${fail.map(_._2).mkString("\n")}")
  }
}
