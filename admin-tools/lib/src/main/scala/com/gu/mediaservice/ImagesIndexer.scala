package com.gu.mediaservice

import java.net.URL

import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.bulk.BulkResponse
import com.sksamuel.elastic4s.http.{ElasticClient, ElasticProperties, Response}
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success}


object ImagesIndexer {

  private val apiKey = "dev-"
  private val projectionBaseEndpoint = "https://admin-tools.media.local.dev-gutools.co.uk/images/projection"
  private val esEndpoint = "http://localhost:9200"
  private val esIndex = "images/_doc"
  private val esClient = ElasticClient(ElasticProperties(esEndpoint))


  def prepareBlobs(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    Future.traverse(mediaIds) { id =>
      val projectionEndpoint = s"$projectionBaseEndpoint/$id"
      val reqUrl = new URL(projectionEndpoint)
      GridClient.makeGetRequestAsync(reqUrl, apiKey)
    }.map(l => l.filter(_.statusCode == 200).map(res => Json.stringify(res.body)))
  }

  def batchIndex(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[String]] = prepareBlobs(mediaIds)
    val images = Await.result(blobsFuture, Duration.Inf)
    println(s"prepared json blobs list of size: ${images.size}")

    println("attempting to send bulk insert request to elasticsearch")
    val bulkRes: Future[Response[BulkResponse]] = esClient.execute {
      bulk(
        images.map(img => indexInto(esIndex) source img)
      )
    }

    bulkRes.onComplete {
      case Success(bulkRes) =>
        println(s"bulk insert was successful: ${bulkRes.result}")
      case Failure(exception) =>
        println(s"bulk insert failed: ${exception.getMessage}")
    }

  }
}


object ImagesIndexerLocalHandler extends App {

  import scala.concurrent.ExecutionContext.Implicits.global

  val mediaIds = List(
    "011db3facffd4ef3d3e07eabbd3c07bb41cbf819",
    "011a95f670b71e4dd223f4b8eda5bfb41235ca7e",
    "066d163d11dfdc8223fb9a15fbf5265f0e47655b",
    "d23c0faaed970d9769e67d7ed4eefbbb35b6fccc",
    "d23c0e19cdc10a7573d4c712313a105863e998c3",
    "non-existent"
  )


  ImagesIndexer.batchIndex(mediaIds)

  //  val f = ImagesIndexer.prepareBlobs(mediaIds)
  //
  //  val blobs = Await.result(f, Duration.Inf)
  //
  //  blobs.foreach { json =>
  //    println("---------------------------------------")
  //    println(json)
  //    println("---------------------------------------")
  //  }

}
