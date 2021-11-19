package com.gu.mediaservice.scripts

import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.{SearchHit, SearchResponse}
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import play.api.libs.json._

import java.io.{BufferedWriter, File, FileOutputStream, OutputStreamWriter}
import java.util.concurrent.TimeUnit
import scala.annotation.tailrec
import scala.concurrent.duration.{Duration, FiniteDuration}
import scala.concurrent.{Await, Future}

object EsImageMetadata extends EsScript {
  override def run(esUrl: String, args: List[String]): Unit = {
    val outputFile: File = args match {
      case fileName :: Nil =>
        val file = new File(fileName)
        //if (file.exists()) throw new IllegalStateException("This would overwrite a file so bailing now in case that would be bad")
        file
      case _ => throw new IllegalArgumentException("Usage: BucketMetadata <bucket> <outputFilename.jsonl.bz2>")
    }

    object Client extends EsClient(esUrl) {
    }

    val scrollTime = new FiniteDuration(5, TimeUnit.MINUTES)
    val scrollSize = 500
    val currentIndex = Client.currentIndex

    System.err.println(s"Using index $currentIndex")

    val fileOutputStream = new FileOutputStream(outputFile)
    val compressOutputStream = new BZip2CompressorOutputStream(fileOutputStream)
    val sw = new OutputStreamWriter(compressOutputStream)
    System.err.println(s"Output encoding: ${sw.getEncoding}")
    val writer = new BufferedWriter(sw)

    try {
      val initialResults = initialQuery(Client.client, currentIndex, scrollTime, scrollSize)
      Await.ready(recurse(initialResults, writer, 0L, 0L), Duration.Inf)
    } finally {
      Client.client.close()
      writer.close()
    }

    @tailrec
    def recurse(lastResponse: SearchResponse, outputWriter: BufferedWriter, done: Long, warnings: Long): Future[Unit] = {
      val newDone = done + scrollSize
      val hits = lastResponse.hits.hits
      if(hits.nonEmpty) {
        val newWarnings = writeMetadata(outputWriter, hits) + warnings
        System.err.println(scrollPercentage(lastResponse, newDone, newWarnings))
        val scrollResponse = performScroll(Client.client, lastResponse.scrollId.get, scrollTime)
        Thread.sleep(500)
        //if (done < 100000)
        recurse(scrollResponse, outputWriter, newDone, newWarnings)
        //else Future.successful(())
      } else {
        System.err.println("No more results found")
        Future.successful(())
      }
    }

  }

  override def usageError: Nothing = {
    System.err.println("Usage: UpdateSettings <ES_URL>")
    sys.exit(1)
  }

  def scrollPercentage(scroll: SearchResponse, done: Long, warnings: Long): String = {
    val total = scroll.hits.total.value
    val percentage = (Math.min(done,total).toFloat / total) * 100
    s"Extracted ${Math.min(done,total)} of $total ($percentage%) with $warnings warnings"
  }

  def initialQuery(client: ElasticClient, index: String, scrollTime: FiniteDuration, scrollSize: Int) : SearchResponse = {
    val queryType = matchAllQuery()
    //val queryType = matchQuery("id", "cbaa4f052b1d4ae996e63ee1d07ada0092b4b581")

    val queryResponse = client.execute({
      search(index)
        .scroll(scrollTime)
        .size(scrollSize)
        .query(queryType)
        .fetchSource(false)
        .sourceInclude(
        //.docValues(
          "id",
          "uploadedBy",
          "uploadTime",
          "uploadInfo.filename",
          "identifiers.*",
          "lastModified"
        )
    }).await

    queryResponse.status match {
      case 200 => queryResponse.result
      case _ =>
        client.close()
        throw new Exception("Failed performing search query")
    }
  }

  def performScroll(client: ElasticClient, scrollId: String, scrollTime: FiniteDuration): SearchResponse = {
    val scrollResponse = client.execute({
      searchScroll(scrollId)
        .keepAlive(scrollTime)
    }).await

    scrollResponse.status match {
      case 200 => scrollResponse.result
      case _ =>
        client.close()
        throw new Exception("Failed performing bulk index")
    }
  }

  def writeMetadata(writer: BufferedWriter, hits: Array[SearchHit]): Long = {
    def jsObjectToStringMap(obj: JsObject): Map[String, String] = {
      obj.fields.collect {
        case (key, JsString(value)) => key -> value
      }.toMap
    }

    val jsonLines = hits.flatMap { hit =>
      val source = Json.parse(hit.sourceAsString)
      (source \ "id").asOpt[String] map { id =>
        val doc = EsDocumentWithMetadata(
          id = id,
          lastModified = (source \ "lastModified").asOpt[String],
          uploadedBy = (source \ "uploadedBy").asOpt[String],
          uploadTime = (source \ "uploadTime").asOpt[String],
          fileName = (source \ "uploadInfo" \ "filename").asOpt[String],
          identifiers = (source \ "identifiers").asOpt[JsObject].map(jsObjectToStringMap).getOrElse(Map.empty)
        )
        Json.stringify(Json.toJson(doc))
      }
    }

    jsonLines.foreach{ json =>
      writer.write(json)
      writer.newLine()
    }
    writer.flush()

    hits.length - jsonLines.length
  }
}

case class EsDocumentWithMetadata(
                                   id: String,
                                   lastModified: Option[String],
                                   uploadedBy: Option[String],
                                   uploadTime: Option[String],
                                   fileName: Option[String],
                                   identifiers: scala.collection.immutable.Map[String, String] = Map.empty
                                 )

object EsDocumentWithMetadata {
  implicit val formats: Format[EsDocumentWithMetadata] = Json.using[Json.WithDefaultValues].format[EsDocumentWithMetadata]
}
