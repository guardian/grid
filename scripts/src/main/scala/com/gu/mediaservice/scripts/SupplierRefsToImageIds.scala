package com.gu.mediaservice.scripts

import org.joda.time.DateTime
import play.api.libs.json.{JsValue, Json}

import java.io.PrintWriter
import java.net.URI
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import java.util.concurrent.{CompletableFuture, TimeUnit}
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.io.Source

object SupplierRefsToImageIds extends App {
  implicit val executionContext: ExecutionContext = ExecutionContext.global

  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"
  val MaxConcurrentRequests = 50
  val client: HttpClient = HttpClient.newHttpClient()

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

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

  def readSupplierRefs(csvPath: String): List[String] = {
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
  }

  val suppliersInTest = List("13300266", "17218005aa", "17217489bk")

  val (supplierRefs, outputPath) = if (STAGE == "PROD") {
    val csvPath = args.lift(0).getOrElse {
      throw new IllegalArgumentException("Usage (PROD): <supplierRefsCsv> <outputFile>")
    }
    val outPath = args.lift(1).getOrElse {
      throw new IllegalArgumentException("Usage (PROD): <supplierRefsCsv> <outputFile>")
    }
    (readSupplierRefs(csvPath), outPath)
  } else {
    val outPath = args.lift(0).getOrElse {
      throw new IllegalArgumentException("Usage: <outputFile>")
    }
    (suppliersInTest, outPath)
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

  val program = mediaIds.map { ids =>
    val writer = new PrintWriter(outputPath)
    try {
      writer.println("imageId")
      ids.foreach(writer.println)
    } finally {
      writer.close()
    }
    if (ids.isEmpty) {
      println(s"No Grid ids found, wrote header-only file to $outputPath")
    } else {
      println(s"Wrote ${ids.size} image ids to $outputPath")
    }
  }

  Await.result(program, scala.concurrent.duration.Duration.Inf)
}
