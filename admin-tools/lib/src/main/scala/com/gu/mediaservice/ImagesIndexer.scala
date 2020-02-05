package com.gu.mediaservice

import java.net.URL

import play.api.libs.json.JsValue

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}


object ImagesIndexer {

  private val apiKey = "dev-"
  private val projectionBaseEndpoint = "https://admin-tools.media.local.dev-gutools.co.uk/images/projection"

  def prepareBlobs(mediaIds: List[String])(implicit ec: ExecutionContext) = {

    val imageJsonBlobs: Future[List[JsValue]] = Future.traverse(mediaIds) { id =>
      val projectionEndpoint = s"$projectionBaseEndpoint/$id"
      val reqUrl = new URL(projectionEndpoint)
      GridClient.makeGetRequestAsync(reqUrl, apiKey)
    }.map(l => l.filter(_.statusCode == 200).map(_.body))
    imageJsonBlobs
  }

  def batchIndex(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    prepareBlobs(mediaIds)

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

  val f = ImagesIndexer.prepareBlobs(mediaIds)

  val blobs = Await.result(f, Duration.Inf)

  blobs.foreach { json =>
    println("---------------------------------------")
    println(json)
    println("---------------------------------------")
  }

}
