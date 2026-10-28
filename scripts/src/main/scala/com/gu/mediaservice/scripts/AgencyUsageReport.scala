package com.gu.mediaservice.scripts

import com.gu.mediaservice.model.usage.{DigitalUsage, PrintUsage, PublishedUsageStatus, UnknownUsageStatus, UsageStatus, UsageType}
import com.gu.mediaservice.model.{Agencies, Agency}
import org.joda.time.DateTime
import play.api.libs.json.{JsValue, Json}

import java.io.{BufferedWriter, FileWriter}
import java.nio.file.{Files, Paths}
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import scala.concurrent.duration._
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.util.Try
import scala.util.control.NonFatal

/**
 * Generates one CSV report per agency of usages of images from the agencies defined in `Agencies`
 * (see .github/usage-reporting.instructions.md).
 *
 * Usages come from media-api's /usage/suppliers/:id/images, which only returns the usages that count towards the quota.
 *
 * Usage: GRID_KEY=... CAPI_KEY=... STAGE=PROD [CAPI_URL=...] sbt "scripts/runMain com.gu.mediaservice.scripts.AgencyUsageReport [--dry-run] [agency ...]"
 * With --dry-run, only logs how many images match each agency's search, without fetching further data or writing files.
 * Agencies are given by key (e.g. getty, aap) or supplier name; with none given, all agencies are reported.
 * Files are written to ~/Downloads as agency-usage-report-<key>-<yyyy-MM-dd>.csv
 */
object AgencyUsageReport extends App {
  implicit val executionContext: ExecutionContext = ExecutionContext.global

  val GRID_KEY = sys.env.getOrElse("GRID_KEY", throw new RuntimeException("Must set a GRID_KEY env variable"))
  val CAPI_KEY = sys.env.getOrElse("CAPI_KEY", throw new RuntimeException("Must set a CAPI_KEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRID_DOMAIN = if (STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  val MaxAttempts = 3
  val OutputDir = Paths.get(sys.props("user.home"), "Downloads")
  val PageSize = 200
  // media-api's ContentApi uses the capi.preview.url config, but the preview hosts need IAM-signed requests,
  // which this script can't do. The live hosts accept an API key; CAPI_URL overrides the per-stage default.
  val CapiUrl = sys.env.getOrElse(
    "CAPI_URL",
    if (STAGE == "PROD") "https://content.guardianapis.com" else "https://content.code.dev-guardianapis.com"
  )
  // The most CAPI allows per page, so one request returns every article of a batch of ids
  val CapiIdsPerRequest = 50
  // The request is rejected above 4096 characters, so batches are also capped on the length of the uri
  val MaxCapiUriLength = 3500
  val CapiImageWidth = "1000"
  val client: HttpClient = HttpClient.newHttpClient()

  def log(message: String, level: Int = 0): Unit = println(("  " * level) + message)

  log(s"Running for stage $STAGE with Grid domain $GRID_DOMAIN and CAPI url $CapiUrl")

  val Headers = List(
    "ID", "Cpro Name", "Pbln Name", "Edtn Date Published", "Book Name", "Appears In Section",
    "Headline Or Caption", "Page Num", "Source", "Credit", "Iptc Image Copyright", "Iptc Photographer",
    "Iptc Picture Supplier Ref", "Iptc Provider", "Picture Picdar Urn", "Media Id", "URL", "URL2",
    "IPTC_BYLINE", "IPTC_CAPTION_ABSTRACT"
  )
  val GettyHeaders = List("getty_asset_id", "GETTY_ORIGINAL_FILENAME")

  def periodInDays(agencyKey: String): Int = if (agencyKey == "getty") 7 else 30

  def csvLine(fields: Seq[String]): String =
    fields.map(f => "\"" + f.replace("\"", "\"\"") + "\"").mkString(",")

  def getValue(json: JsValue, path: String*): Option[String] =
    path.foldLeft[Option[JsValue]](Some(json))((j, p) => j.flatMap(v => (v \ p).toOption))
      .flatMap(_.asOpt[String]).map(_.trim).filter(_.nonEmpty)

  def statusOf(usage: JsValue): Option[UsageStatus] = getValue(usage, "status").flatMap(s => Try(UsageStatus(s)).toOption)
  def platformOf(usage: JsValue): Option[UsageType] = getValue(usage, "platform").flatMap(p => Try(UsageType(p)).toOption)

  case class CapiArticle(
    publishedDate: Option[String],
    sectionName: Option[String],
    elements: Seq[JsValue]
  ) {
    // Only present while the image is still in the article, so not for removed usages
    def imageUrl(imageId: String): Option[String] =
      elements
        .filter(e => getValue(e, "type").contains("image") && getValue(e, "id").contains(imageId))
        .flatMap(e => (e \ "assets").asOpt[Seq[JsValue]].getOrElse(Seq.empty))
        .filter(a => getValue(a, "type").contains("image"))
        .find(a => (a \ "typeData" \ "width").toOption.exists(w => w.asOpt[String].orElse(w.asOpt[Int].map(_.toString)).contains(CapiImageWidth)))
        .flatMap(a => getValue(a, "file"))
  }

  // Retrying can't fix a client error such as 401 or 414, only timeouts (408) and rate limiting (429) are worth another go
  class NonRetryableException(message: String) extends RuntimeException(message)

  def isRetryableStatus(status: Int): Boolean = status < 400 || status >= 500 || status == 408 || status == 429

  def getJson(uri: String, headers: Seq[String], description: String, attempt: Int = 1): Future[JsValue] = {
    val builder = HttpRequest.newBuilder(new URI(uri))
    // headers() rejects an empty list
    val request = (if (headers.isEmpty) builder else builder.headers(headers: _*)).build()
    client.sendAsync(request, BodyHandlers.ofString()).asScala
      .map { response =>
        val status = response.statusCode()
        if (status != 200) {
          val message = s"$description returned $status: ${response.body().take(300)}"
          throw (if (isRetryableStatus(status)) new RuntimeException(message) else new NonRetryableException(message))
        }
        Json.parse(response.body())
      }
      .recoverWith {
        case NonFatal(error) if attempt < MaxAttempts && !error.isInstanceOf[NonRetryableException] =>
          log(s"Attempt $attempt failed for $description: ${error.getMessage}, retrying", 2)
          Thread.sleep(2000L * attempt)
          getJson(uri, headers, description, attempt + 1)
      }
  }

  def traverseBatched[A, B](items: Seq[A], batchSize: Int)(f: A => Future[B]): Future[Seq[B]] =
    items.grouped(batchSize).foldLeft(Future.successful(Seq.empty[B])) { (completed, batch) =>
      for {
        previous <- completed
        results <- Future.traverse(batch)(f)
      } yield previous ++ results
    }

  // The endpoint only returns the qualifying usages added within the date range
  def searchUri(agencyKey: String, since: DateTime, length: Int, offset: Int): String = {
    val query = URLEncoder.encode(s"usages@>added:${since.toString("yyyy-MM-dd")}", "UTF-8")
    s"https://api.media.$GRID_DOMAIN/usage/suppliers/$agencyKey/images?q=$query&length=$length&offset=$offset"
  }

  def fetchPage(agencyKey: String, since: DateTime, offset: Int): Future[Seq[JsValue]] =
    getJson(searchUri(agencyKey, since, PageSize, offset), Seq("X-Gu-Media-Key", GRID_KEY), s"Search for $agencyKey at offset $offset")
      .map(json => (json \ "data").asOpt[Seq[JsValue]].getOrElse(Seq.empty))

  // Asks for a single image just to read the total of matching images
  def countImagesForDryRun(agencyKey: String, since: DateTime): Future[Long] =
    getJson(searchUri(agencyKey, since, 1, 0), Seq("X-Gu-Media-Key", GRID_KEY), s"Count search for $agencyKey")
      .map(json => (json \ "total").asOpt[Long].getOrElse(throw new RuntimeException("No total in search response")))

  // The CAPI id of an article is the path of its web url, e.g. world/2026/oct/29/some-article
  def capiIdOf(webUrl: String): Option[String] =
    Try(new URI(webUrl).getPath.stripPrefix("/")).toOption.filter(_.nonEmpty)

  def digitalWebUrlOf(usage: JsValue): Option[String] =
    if (platformOf(usage).contains(DigitalUsage)) getValue(usage, "digitalUsageMetadata", "webUrl") else None

  // Slashes are valid in a query string, keeping them unencoded makes the ids a third shorter
  def encodeCapiIds(articleIds: Seq[String]): String =
    articleIds.map(id => URLEncoder.encode(id, "UTF-8").replace("%2F", "/")).mkString(",")

  def capiUri(articleIds: Seq[String]): String =
    s"$CapiUrl/search?ids=${encodeCapiIds(articleIds)}&show-elements=image&page-size=$CapiIdsPerRequest&api-key=$CAPI_KEY"

  // Groups ids into batches of at most CapiIdsPerRequest whose uri stays below MaxCapiUriLength
  def capiBatches(articleIds: Seq[String]): Seq[Seq[String]] =
    articleIds.foldLeft(Vector(Vector.empty[String])) { (batches, id) =>
      val current = batches.last
      if (current.nonEmpty && (current.size >= CapiIdsPerRequest || capiUri(current :+ id).length > MaxCapiUriLength))
        batches :+ Vector(id)
      else batches.init :+ (current :+ id)
    }.filter(_.nonEmpty)

  // Looks up a batch of articles by id, ids that CAPI doesn't know are missing from the result
  def fetchCapiBatch(articleIds: Seq[String]): Future[Map[String, CapiArticle]] = {
    getJson(capiUri(articleIds), Seq.empty, s"CAPI lookup of ${articleIds.size} articles").map { json =>
      val results = (json \ "response" \ "results").asOpt[Seq[JsValue]].getOrElse(Seq.empty)
      val found = results.flatMap { article =>
        getValue(article, "id").map(_ -> CapiArticle(
          publishedDate = getValue(article, "webPublicationDate"),
          sectionName = getValue(article, "sectionName"),
          elements = (article \ "elements").asOpt[Seq[JsValue]].getOrElse(Seq.empty)
        ))
      }.toMap
      val missing = articleIds.filterNot(found.contains)
      if (missing.nonEmpty) log(s"CAPI did not return ${missing.size} articles: ${missing.mkString(", ")}", 3)
      found
    }
  }

  def fetchCapiArticles(articleIds: Seq[String]): Future[Map[String, CapiArticle]] =
    traverseBatched(capiBatches(articleIds), 1)(fetchCapiBatch)
      .map(_.foldLeft(Map.empty[String, CapiArticle])(_ ++ _))

  def fetchImages(agencyKey: String, since: DateTime, offset: Int = 0): Future[Seq[JsValue]] =
    fetchPage(agencyKey, since, offset).flatMap { page =>
      log(s"${DateTime.now()}: fetched ${page.size} images at offset $offset", 2)
      if (page.size < PageSize) Future.successful(page)
      else fetchImages(agencyKey, since, offset + PageSize).map(page ++ _)
    }

  def imageIdOf(image: JsValue): String = getValue(image, "id").getOrElse("")

  def usagesOf(image: JsValue): Seq[JsValue] = (image \ "usages").asOpt[Seq[JsValue]].getOrElse(Seq.empty)

  // A malformed image is logged and skipped rather than failing the whole agency
  def safeRowsFor(
    agencyName: String,
    image: JsValue,
    usages: Seq[JsValue],
    capiArticles: Map[String, CapiArticle],
    isGetty: Boolean
  ): Seq[(Option[DateTime], List[String])] =
    try rowsFor(agencyName, image, usages, capiArticles, isGetty)
    catch {
      case NonFatal(error) =>
        log(s"Skipping image ${imageIdOf(image)}: ${error.getMessage}", 2)
        Seq.empty
    }

  def rowsFor(
    agencyName: String,
    image: JsValue,
    usages: Seq[JsValue],
    capiArticles: Map[String, CapiArticle],
    isGetty: Boolean
  ): Seq[(Option[DateTime], List[String])] = {
    val originalMetadata = (image \ "originalMetadata").getOrElse(Json.obj())
    val byline = getValue(originalMetadata, "byline")

    // Returns the publish date alongside the row so rows can be sorted on it
    def row(usage: JsValue): (Option[DateTime], List[String]) = {
      val isPrint = platformOf(usage).contains(PrintUsage)
      val isPublished = statusOf(usage).contains(PublishedUsageStatus)
      val isPublishedPrint = isPrint && isPublished
      val printUsageMetadata = (usage \ "printUsageMetadata").getOrElse(Json.obj())
      val digitalUsageMetadata = (usage \ "digitalUsageMetadata").getOrElse(Json.obj())
      val frontUrl =
        if (statusOf(usage).contains(UnknownUsageStatus)) getValue(usage, "frontUsageMetadata", "front").map(front => s"theguardian.com/$front")
        else None
      val article = digitalWebUrlOf(usage).flatMap(capiIdOf).flatMap(capiArticles.get)

      val publishedDate = (
        if (isPrint) getValue(printUsageMetadata, "issueDate") else article.flatMap(_.publishedDate)
      ).flatMap(d => Try(DateTime.parse(d)).toOption)
      val columns = List(
        "",
        agencyName,
        if (isPrint) "The Guardian" else "theguardian.com",
        publishedDate.map(_.toString("d/M/yyyy")).getOrElse(""),
        if (isPrint) "The Guardian" else "",
        if (isPublishedPrint) getValue(printUsageMetadata, "sectionName").getOrElse("") else article.flatMap(_.sectionName).getOrElse(""),
        if (isPublishedPrint) "" else getValue(digitalUsageMetadata, "webTitle").getOrElse(""),
        if (isPublishedPrint) (printUsageMetadata \ "pageNumber").asOpt[Int].map(_.toString).getOrElse("") else "",
        agencyName,
        byline.map(b => s"$b/$agencyName").getOrElse(agencyName),
        getValue(originalMetadata, "iptc", "Copyright Notice").getOrElse(""),
        byline.getOrElse(""),
        getValue(originalMetadata, "suppliersReference").getOrElse(""),
        getValue(originalMetadata, "iptc", "Credit").getOrElse(""),
        getValue(image, "identifiers", "picdarurn").getOrElse(""),
        imageIdOf(image),
        if (isPrint) "" else article.flatMap(_.imageUrl(imageIdOf(image))).getOrElse(""),
        if (isPrint) "" else frontUrl.orElse(getValue(digitalUsageMetadata, "webUrl")).getOrElse(""),
        byline.getOrElse(""),
        getValue(originalMetadata, "description").getOrElse("")
      ) ++ (
        if (isGetty) List(getValue(originalMetadata, "getty", "Asset ID").getOrElse(""), getValue(originalMetadata, "getty", "Original Filename").getOrElse(""))
        else Nil
      )
      publishedDate -> columns
    }

    usages.map(row)
  }

  val DryRunFlag = "--dry-run"
  val isDryRun = args.contains(DryRunFlag)
  val requested = args.toList.filterNot(_ == DryRunFlag).map(_.toLowerCase)
  val agencies = Agencies.all.toList.sortBy(_._1).filter { case (key, agency) =>
    requested.isEmpty || requested.contains(key) || requested.contains(agency.supplier.toLowerCase)
  }
  if (agencies.isEmpty) {
    log(s"No matching agencies for ${requested.mkString(", ")}. Available: ${Agencies.all.keys.mkString(", ")}")
    sys.exit(1)
  }

  def writeCsv(path: String, rows: Seq[List[String]], isGetty: Boolean): Unit = {
    Files.createDirectories(OutputDir)
    val writer = new BufferedWriter(new FileWriter(path))
    try {
      writer.write(csvLine(if (isGetty) Headers ++ GettyHeaders else Headers))
      writer.newLine()
      rows.foreach { row =>
        writer.write(csvLine(row))
        writer.newLine()
      }
    } finally {
      writer.close()
    }
  }

  sealed trait Step { def description: String }
  case object FetchGridUsages extends Step { val description = "fetching usages from Grid" }
  case object FetchCapiArticles extends Step { val description = "fetching CAPI articles" }
  case object WriteCsv extends Step { val description = "writing CSV" }

  case class StepException(step: Step, cause: Throwable)
    extends RuntimeException(s"Error while ${step.description}: ${cause.getClass.getSimpleName}: ${cause.getMessage}", cause)

  implicit class FutureStep[A](future: Future[A]) {
    def withStep(step: Step): Future[A] = future.transform(_.recoverWith {
      case e: StepException => scala.util.Failure(e)
      case NonFatal(e) => scala.util.Failure(StepException(step, e))
    })
  }

  def withStepSync[A](step: Step)(body: => A): A =
    try body catch { case NonFatal(e) => throw StepException(step, e) }

  // Each agency is processed independently so one failure doesn't lose the others' reports
  def processAgency(key: String, agency: Agency): Future[Either[String, Unit]] = {
    val agencyName = agency.supplier
    val since = DateTime.now().minusDays(periodInDays(key))

    if (isDryRun) {
      log(s"Dry run: counting images for $agencyName since $since...", 1)
      return countImagesForDryRun(key, since).withStep(FetchGridUsages)
        .map { total =>
          log(s"$total images with usages added since $since match the search for $agencyName", 2)
          Right(())
        }
        .recover { case NonFatal(error) =>
          log(s"Failed to count images for $agencyName: ${error.getMessage}", 2)
          Left(agencyName)
        }
    }

    log(s"Fetching usages for $agencyName since $since...", 1)
    log(s"Fetching images with usages from Grid...", 2)

    val program = fetchImages(key, since).withStep(FetchGridUsages).flatMap { images =>
      val imagesWithUsages = images.map(image => image -> usagesOf(image)).filter(_._2.nonEmpty)

      if (imagesWithUsages.isEmpty) {
        log(s"No images with qualifying usages found for $agencyName, skipping", 2)
        Future.successful(Right(()))
      } else {
        val articleIds = imagesWithUsages.flatMap(_._2).flatMap(digitalWebUrlOf).flatMap(capiIdOf).distinct
        for {
          capiArticles <- {
            log(s"Fetching ${articleIds.size} CAPI articles...", 2)
            fetchCapiArticles(articleIds).withStep(FetchCapiArticles)
          }
        } yield {
          val rows = imagesWithUsages
            .flatMap { case (image, usages) => safeRowsFor(agencyName, image, usages, capiArticles, key == "getty") }
            // Rows without a date go last
            .sortBy { case (date, _) => (date.isEmpty, date.map(_.getMillis).getOrElse(0L)) }
            .map { case (_, row) => row }
          val path = OutputDir.resolve(s"agency-usage-report-$key-${DateTime.now().toString("yyyy-MM-dd")}.csv").toString
          log(s"Writing ${rows.size} rows to $path...", 2)
          withStepSync(WriteCsv)(writeCsv(path, rows, key == "getty"))
          log(s"Wrote ${rows.size} usage rows from ${images.size} images to $path", 2)
          Right(())
        }
      }
    }
    program
      .recover { case NonFatal(error) =>
        log(s"Failed to generate report for $agencyName: ${error.getMessage}", 2)
        Left(agencyName)
      }
  }

  val program = agencies.foldLeft(Future.successful(List.empty[Either[String, Unit]])) { case (previous, (key, agency)) =>
    previous.flatMap(results => processAgency(key, agency).map(results :+ _))
  }

  val failures = Await.result(program, Duration.Inf).collect { case Left(agencyName) => agencyName }
  if (failures.nonEmpty) {
    log(s"Reports failed for: ${failures.mkString(", ")}")
    sys.exit(1)
  }
  log("Done")
}
