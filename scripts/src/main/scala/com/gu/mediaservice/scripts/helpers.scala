package com.gu.mediaservice.scripts

import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.util.concurrent.{CompletableFuture, TimeUnit}
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.io.Source

// Shared Grid HTTP client and batching helpers used by the supplier clean-up scripts.
class GridClient(val gridKey: String, val stage: String, val maxConcurrentRequests: Int)(implicit ec: ExecutionContext) {
  val gridDomain: String = if (stage == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  private val client: HttpClient = HttpClient.newHttpClient()

  def send(request: HttpRequest): Future[HttpResponse[String]] =
    client.sendAsync(request, BodyHandlers.ofString()).asScala

  def traverseBatched[A, B](items: Seq[A], batchSize: Int)(f: A => Future[B]): Future[Seq[B]] =
    items.grouped(batchSize).foldLeft(Future.successful(Seq.empty[B])) { (completed, batch) =>
      for {
        previousResults <- completed
        batchResults <- Future.traverse(batch)(f)
      } yield previousResults ++ batchResults
    }

  def delay(seconds: Long): Future[Unit] =
    CompletableFuture
      .runAsync(() => (), CompletableFuture.delayedExecutor(seconds, TimeUnit.SECONDS))
      .asScala
      .map(_ => ())
}

object GridClient {
  def fromEnv()(implicit ec: ExecutionContext): GridClient = {
    val gridKey = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
    val stage = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
    new GridClient(gridKey, stage, maxConcurrentRequests = 50)
  }
}

object CsvFile {
  // Reads the first column of a CSV (skipping the header row), de-duplicated.
  def readFirstColumn(csvPath: String): List[String] = {
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
}


