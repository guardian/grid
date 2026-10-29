package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.leases.MediaLease
import play.api.libs.json.Json

import java.io.PrintWriter
import java.net.URI
import java.net.http.HttpRequest.BodyPublishers
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.io.Source
import scala.util.control.NonFatal

object ImageIdsCleanUp extends App {
  implicit val executionContext: ExecutionContext = ExecutionContext.global

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  val DRYRUN = sys.env.contains("DRYRUN")
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

  val imageIds = {
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
        .distinct
        .toList
    } finally {
      source.close()
    }
  }
  println(s"Found ${imageIds.size} image ids to process")
  if (imageIds.isEmpty) {
    println("No image ids found in supplied csv, exiting script")
    sys.exit(1)
  }

  val usagesBody = BodyPublishers.ofString("""{"data":{"restrictions":"No longer available from the supplier","category":"chargeable"}}""")

  val ReportPath = "./kill-notice-report.csv"

  case class ProcessResult(mediaId: String, success: Boolean, outcome: String)

  def csvField(value: String): String = // TODO this may be unnecessary? 
    "\"" + value.replace("\"", "\"\"") + "\""

  def writeReport(path: String, results: Seq[ProcessResult]): Unit = {
    val writer = new PrintWriter(path)
    try {
      writer.println("imageId,success,outcome")
      results.foreach { result =>
        writer.println(s"${csvField(result.mediaId)},${result.success},${csvField(result.outcome)}")
      }
    } finally {
      writer.close()
    }
  }

  def processMediaId(mediaId: String, index: Int, total: Int): Future[ProcessResult] = {
    println(s"Running for id $mediaId, ${index + 1} of $total")
    // Make an api request to try to delete the image, either successful or
    // attempt a hard delete
    val request = HttpRequest.newBuilder(new URI(s"https://api.media.$GRIDDOMAIN/images/$mediaId")).headers("X-Gu-Media-Key", GRIDKEY).DELETE().build()
    // check status response, if not 202
    // modify the usage rights
    val outcome = send(request).flatMap { response => response.statusCode() match {
      case 202 => {
        println(s"Successfully deleted $mediaId")
        Future.successful((true, "deleted"))
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
                (true, "usage-rights-set-and-deny-leased")
              }
              else {
                println(s"Unable to set deny-lease for $mediaId, received response ${response.statusCode()}")
                println(s"Response body: ${response.body()}")
                (false, s"usage-rights-set-but-deny-lease-failed-${response.statusCode()}")
              }
            }
          } else {
            println(s"Unable to set usage rights for $mediaId, received response ${response.statusCode()}")
            Future.successful((false, s"usage-rights-failed-${response.statusCode()}"))
          }
        }
      }
      case code => {
        println(s"Got unexpected response $code calling delete for ${mediaId}")
        Future.successful((false, s"unexpected-delete-response-$code"))
      }
    }}
    outcome
      .map { case (success, status) => ProcessResult(mediaId, success, status) }
      .recover { case NonFatal(error) =>
        println(s"Unable to process $mediaId: ${error.getMessage}")
        ProcessResult(mediaId, false, s"error: ${error.getMessage}")
      }
  }

  println(s"Found ${imageIds.size} ids, now running deletion")
  val program = traverseBatched(imageIds.zipWithIndex, MaxConcurrentRequests) { case (mediaId, index) =>
    if(DRYRUN) {
      println(s"[DRY MODE] Would process $mediaId (${index+1} of ${imageIds.size})")
      Future.successful(ProcessResult(mediaId, true, "dry-run-skipped"))
    } else {
      processMediaId(mediaId, index, imageIds.size)
    }
  }.map { outcomes =>
    val (success, fail) = outcomes.partition(_.success)
    println(s"Successfully processed ${success.size} of  ${imageIds.size}")
    if(fail.nonEmpty) {
      println(s"Unable to process ${fail.size} ids: \n${fail.map(_.mediaId).mkString("\n")}")
    }
    writeReport(ReportPath, outcomes)
    println(s"Wrote outcome report to $ReportPath")
  }

  Await.result(program, scala.concurrent.duration.Duration.Inf)
}
