package com.gu.mediaservice.scripts

import java.net.URI
import java.net.http.HttpResponse.BodyHandlers
import java.net.http.{HttpClient, HttpRequest}
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}
import play.api.libs.json._

/** Fetches all images for each agency from the imageUsagesBySupplier endpoint for July 2026,
  * then applies the quota counting logic from quota-count.instructions.md for comparison
  * against the existing email/CSV-based quota counts.
  *
  * Usage: set STAGE=TEST or STAGE=PROD and API_KEY env variables, then run.
  * Outputs a JSON file per supplier in the format defined in quota-count.instructions.md.
  */
object QuotaCountCheck extends App {
  val gridKey = sys.env.getOrElse("API_KEY", throw new RuntimeException("Must set a API_KEY env variable"))
  val stage   = sys.env.getOrElse("STAGE",   throw new RuntimeException("Must set a STAGE env variable (TEST or PROD)"))

  val domain = stage match {
    case "PROD" => "gutools.co.uk"
    case "TEST" => "test.dev-gutools.co.uk"
    case other  => throw new RuntimeException(s"Unknown STAGE '$other', expected TEST or PROD")
  }

  val baseUrl   = s"https://api.media.$domain"
  val pageSize  = 200
  val dateFrom  = "2026-07-01"
  val dateTo    = "2026-08-01"

  // Suppliers to count — matches Agencies.all in common-lib
  val suppliers = Seq("getty", "rex", "aap", "alamy")

  val client = HttpClient.newHttpClient()

  println(s"Running quota count check for stage=$stage, period=$dateFrom to $dateTo")
  println()

  case class SupplierResult(supplierId: String, imageCount: Int, quotaCount: Int)

  val results = suppliers.map { supplierId =>
    val images     = fetchAllImages(supplierId)
    val imageCount = images.size
    val imageEntries = images.map { image =>
      val id    = (image \ "id").as[String]
      val count = quotaCountForImage(image)
      val usages = (image \ "usages").asOpt[JsArray].getOrElse(JsArray()).value.toSeq.map { u =>
        val refType = (u \ "references").asOpt[JsArray].getOrElse(JsArray()).value
          .headOption.flatMap(r => (r \ "type").asOpt[String])
        Json.obj(
          "dateAdded" -> (u \ "dateAdded").asOpt[String],
          "platform"  -> (u \ "platform").asOpt[String],
          "status"    -> (u \ "status").asOpt[String],
        ) ++ refType.map(t => Json.obj("type" -> t)).getOrElse(Json.obj())
      }
      Json.obj("id" -> id, "count" -> count, "usages" -> usages)
    }
    val totalQuotaCount = imageEntries.map(e => (e \ "count").as[Int]).sum
    val output = Json.obj("quotaCount" -> totalQuotaCount, "images" -> imageEntries)
    val filename = s"quota-count-$supplierId-${stage.toLowerCase}.json"
    Files.writeString(Paths.get(filename), Json.prettyPrint(output))
    println(s"  Written $filename")
    SupplierResult(supplierId, imageCount, totalQuotaCount)
  }

  println()
  val colWidth = 20
  def pad(s: String) = s.padTo(colWidth, ' ')
  val header    = s"${pad("Supplier")}${pad("Unique Images")}${pad("Quota Count")}"
  val separator = "-" * header.length
  println(separator)
  println(header)
  println(separator)
  results.foreach { r =>
    println(s"${pad(r.supplierId)}${pad(r.imageCount.toString)}${pad(r.quotaCount.toString)}")
  }
  println(separator)

  // Fetches all pages from imageUsagesBySupplier for the given supplier and date range.
  def fetchAllImages(supplierId: String): Seq[JsValue] = {
    val q = URLEncoder.encode(
      s"usages@>added:$dateFrom usages@<added:$dateTo",
      StandardCharsets.UTF_8
    )

    def fetchPage(offset: Int, accumulated: Seq[JsValue]): Seq[JsValue] = {
      val url = s"$baseUrl/usage/suppliers/$supplierId/images?q=$q&offset=$offset&length=$pageSize"
      val request = HttpRequest.newBuilder(new URI(url))
        .header("X-Gu-Media-Key", gridKey)
        .GET()
        .build()

      val response = client.send(request, BodyHandlers.ofString())
      if (response.statusCode() != 200) {
        throw new RuntimeException(s"Unexpected response ${response.statusCode()} for $supplierId at offset $offset: ${response.body()}")
      }

      val json   = Json.parse(response.body())
      val total  = (json \ "total").as[Long]
      val items  = (json \ "data").as[JsArray].value.toSeq
      val all    = accumulated ++ items

      println(s"  [$supplierId] Fetched ${all.size} / $total images (offset=$offset)")

      val nextOffset = offset + pageSize
      if (nextOffset < total) fetchPage(nextOffset, all) else all
    }

    fetchPage(0, Seq.empty)
  }

  // Applies the quota counting logic per image:
  //   - Each Composer usage counts as 1; Fronts and Print are not counted if a Composer usage exists.
  //   - Multiple Fronts on an image count as 1 in total.
  //   - Multiple Print usages each count separately.
  //   - Only usages with status "published", "removed", or "unknown" qualify.
  def quotaCountForImage(image: JsValue): Int = {
    val usages    = (image \ "usages").asOpt[JsArray].getOrElse(JsArray()).value.toSeq
    val qualifying = usages.filter { u =>
      val status = (u \ "status").asOpt[String].getOrElse("")
      val dateAdded = (u \ "dateAdded").asOpt[String].getOrElse("")
      Set("published", "removed", "unknown").contains(status) &&
        dateAdded >= s"${dateFrom}T00:00:00.000Z" &&
        dateAdded <= s"${dateTo}T23:59:59.999Z"
    }

    def hasReferenceType(usage: JsValue, refType: String): Boolean =
      (usage \ "references").asOpt[JsArray].getOrElse(JsArray()).value
        .exists(r => (r \ "type").asOpt[String].contains(refType))

    val composerCount = qualifying.count { u =>
      (u \ "platform").asOpt[String].contains("digital") && hasReferenceType(u, "composer")
    }

    if (composerCount > 0) {
      composerCount
    } else {
      val hasFront = qualifying.exists { u =>
        (u \ "platform").asOpt[String].contains("digital") && hasReferenceType(u, "front")
      }
      val printCount = qualifying.count { u =>
        (u \ "platform").asOpt[String].contains("print")
      }
      (if (hasFront) 1 else 0) + printCount
    }
  }
}
