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
    val apiCalls = mediaIds.map { id =>
      val projectionUrl = new URL(s"$projectionEndpoint/$id")
      val responseFuture: Future[ResponseWrapper] = gridClient.makeGetRequestAsync(projectionUrl, apiKey)
      val notFoundOrImage: Future[Option[Either[Image, String]]] = responseFuture.map { response =>
        if (response.statusCode == 200) {
          val img = response.body.as[Image]
          Some(Left(img))
        } else if (response.statusCode == 404) {
          InputIdsStore.updateStateToNotFoundImage(id)
          Some(Right(id))
        } else {
          // for example server temporary inaccessible
          InputIdsStore.resetItemState(id)
          None
        }
      }
      notFoundOrImage
    }
    val f = Future.sequence(apiCalls)
    Await.result(f, timeout).flatten
  }
}


