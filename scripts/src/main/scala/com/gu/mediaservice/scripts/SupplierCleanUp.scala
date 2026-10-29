package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.leases.MediaLease
import org.joda.time.DateTime
import play.api.libs.json.{JsValue, Json}

import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import java.util.concurrent.{CompletableFuture, TimeUnit}
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.io.Source
import scala.util.control.NonFatal

object SupplierCleanUp extends App {
  implicit val executionContext: ExecutionContext = ExecutionContext.global

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  val MaxConcurrentRequests = 50
  val client: HttpClient = HttpClient.newHttpClient()

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

  def send(request: HttpRequest) =
    client.sendAsync(request, BodyHandlers.ofString()).asScala

  def traverseBatched[A, B](items: Seq[A], batchSize: Int)(f: A => Future[B]): Future[Seq[B]] = {
    items.grouped(batchSize).foldLeft(Future.successful(Seq.empty[B])) { (completed, batch) =>
      for {
        previousResults <- completed
        batchResults <- Future.traverse(batch)(f)
      } yield previousResults ++ batchResults
    }
  }

  def delay(seconds: Long): Future[Unit] =
    CompletableFuture
      .runAsync(() => (), CompletableFuture.delayedExecutor(seconds, TimeUnit.SECONDS))
      .asScala
      .map(_ => ())

  val suppliersInTest = List("13300266", "17218005aa", "17217489bk")

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
  val supplierRefBatches = supplierRefs.grouped(1000).toList
  val mediaIds = supplierRefBatches.zipWithIndex.foldLeft(Future.successful(Seq.empty[String])) {
    case (previousBatches, (refs, index)) =>
      println("Making API calls in batchSize " + MaxConcurrentRequests)
      previousBatches.flatMap { previousIds =>
        println(s"${DateTime.now()}: Fetching grid ids, for batch ${index + 1} of ${supplierRefBatches.size}")

        val ids = traverseBatched(refs, MaxConcurrentRequests) { ref =>
        val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images?q=suppliersReference%3A$ref")).headers("X-Gu-Media-Key", GRIDKEY).build()
          send(request).map { response =>
            val json = Json.parse(response.body())
            (json \ "data").as[Seq[JsValue]].map(imageMetadata => (imageMetadata \ "data" \ "id").as[String])
          }
        }.map(_.flatten)

        ids.flatMap { batchIds =>
          println(s"${DateTime.now()}: Found ${batchIds.size} grid ids for batch ${index + 1} of ${supplierRefBatches.size}")
          delay(2).map(_ => previousIds ++ batchIds)
        }
      }
  }

  val usagesBody = BodyPublishers.ofString("""{"data":{"restrictions":"No longer available from the supplier","category":"chargeable"}}""")

  def processMediaId(mediaId: String, index: Int, total: Int): Future[(Boolean, String)] = {
    println(s"Running for id $mediaId, ${index + 1} of $total")
    // Make an api request to try to delete the image, either successful or
    // attempt a hard delete
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$mediaId")).headers("X-Gu-Media-Key", GRIDKEY).DELETE().build()
    // check status response, if not 202
    // modify the usage rights
    val success = send(request).flatMap { response => response.statusCode() match {
      case 202 => {
        println(s"Successfully deleted $mediaId")
        Future.successful(true)
      }
      case 405 => {
        println(s"Unable to delete $mediaId, setting usage rights and deny-lease instead")
        val request = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$mediaId/usage-rights"))
          .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(usagesBody).build()
        send(request).flatMap { response =>
          if(response.statusCode() == 200) {
            println(s"Successfully set usage rights for $mediaId")
            val request = HttpRequest.newBuilder(new URI(s"https://media-leases.$GRIDDOMAIN/leases"))
              .headers("X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").POST(denyLeaseBody(mediaId)).build()
            send(request).map { response =>
              if(response.statusCode() == 202) {
                println(s"Successfully set a deny-lease for $mediaId")
                true
              }
              else {
                println(s"Unable to set deny-lease for $mediaId, received response ${response.statusCode()}")
                println(s"Response body: ${response.body()}")
                false
              }
            }
          } else {
            println(s"Unable to set usage rights for $mediaId, received response ${response.statusCode()}")
            Future.successful(false)
          }
        }
      }
      case _ => {
        println(s"Got unexpected response ${response.statusCode()} calling delete for ${mediaId}")
        Future.successful(false)
      }
    }}
    success
      .map((_, mediaId))
      .recover { case NonFatal(error) =>
        println(s"Unable to process $mediaId: ${error.getMessage}")
        (false, mediaId)
      }
  }

  val program = mediaIds.flatMap { ids =>
    if (ids.isEmpty) {
      Future.failed(new RuntimeException("No Grid ids found, exiting script"))
    } else {
      println(s"Found ${ids.size} ids, now running deletion")
      traverseBatched(ids.zipWithIndex, MaxConcurrentRequests) { case (mediaId, index) =>
        processMediaId(mediaId, index, ids.size)
      }.map { outcomes =>
        val (success, fail) = outcomes.partition { case (processed, _) => processed }
        println(s"Successfully processed ${success.size} of  ${ids.size}")
        if(fail.nonEmpty) {
          println(s"Unable to process ${fail.size} ids: \n${fail.map(_._2).mkString("\n")}")
        }
      }
    }
  }

  Await.result(program, scala.concurrent.duration.Duration.Inf)
}
