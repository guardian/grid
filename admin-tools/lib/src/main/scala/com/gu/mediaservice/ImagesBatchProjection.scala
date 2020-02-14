package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.model.Image

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

class ImagesBatchProjection(apiKey: String, domainRoot: String, timeout: Duration, gridClient: GridClient) {

  def validApiKey(projectionEndpoint: String) = {
    val projectionUrl = new URL(s"$projectionEndpoint/not-exists")
    val statusCode = gridClient.makeGetRequestSync(projectionUrl, apiKey).statusCode
    statusCode != 401 && statusCode != 403
  }

  def getImagesProjection(mediaIds: List[String], projectionEndpoint: String,
                          InputIdsStore: InputIdsStore)(implicit ec: ExecutionContext): List[Either[Image, String]] = {
    val f = Future.traverse(mediaIds) { id =>
      val projectionUrl = new URL(s"$projectionEndpoint/$id")
      val responseFuture: Future[ResponseWrapper] = gridClient.makeGetRequestAsync(projectionUrl, apiKey)
      val notFoundOrImage: Future[Either[Image, String]] = responseFuture.map { response =>
        if (response.statusCode == 200) {
          val img = response.body.as[Image]
          Left(img)
        } else {
          InputIdsStore.updateStateToNotFoundImage(id)
          Right(id)
        }
      }
      notFoundOrImage
    }
    Await.result(f, timeout)
  }
}


