package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.model.Image

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

class ImagesBatchProjection(apiKey: String, domainRoot: String, timeout: Duration, gridClient: GridClient) {

  private implicit val ThrottledExecutionContext = ExecutionContext.fromExecutor(java.util.concurrent.Executors.newFixedThreadPool(5))

  def validApiKey(projectionEndpoint: String) = {
    val projectionUrl = new URL(s"$projectionEndpoint/not-exists")
    val statusCode = gridClient.makeGetRequestSync(projectionUrl, apiKey).statusCode
    statusCode != 401 && statusCode != 403
  }

  def getImagesProjection(mediaIds: List[String], projectionEndpoint: String,
                          InputIdsStore: InputIdsStore): List[Either[Image, String]] = {
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
          if (isAKnownError(response)) {
            InputIdsStore.setStateToKnownError(id)
          } else {
            // for example server temporary inaccessible
            InputIdsStore.resetItemState(id)
          }
          None
        }
      }
      notFoundOrImage
    }
    val f = Future.sequence(apiCalls)
    Await.result(f, timeout).flatten
  }

  private trait GetImageStatus
  private case object Found extends GetImageStatus
  private case object NotFound extends GetImageStatus
  private case object Failed extends GetImageStatus
  case class ImagesWithStatus(found: List[String], notFound: List[String], failed: List[String])

  def getImages(mediaIds: List[String], imagesEndpoint: String,
                          InputIdsStore: InputIdsStore): ImagesWithStatus = {
    val apiCalls = mediaIds.map { id =>
      val imagesUrl = new URL(s"$imagesEndpoint/$id")
      val responseFuture: Future[ResponseWrapper] = gridClient.makeGetRequestAsync(imagesUrl, apiKey)
      val futureImageWithStatus: Future[(String, GetImageStatus)] = responseFuture.map { response =>
        if (response.statusCode == 200) {
           (id, Found)
        } else if (response.statusCode == 404) {
           (id, NotFound)
        } else {
          (id, Failed)
        }
      }
      futureImageWithStatus
    }
    val futureResults = Future.sequence(apiCalls)
    val futureImagesWithStatus = futureResults.map{results =>
      val found = results.collect{case (id, Found)=> id}
      val notFound = results.collect{case (id, NotFound) => id}
      val failed = results.collect{case (id, Failed) => id}
      ImagesWithStatus(found,notFound,failed)
    }
    Await.result(futureImagesWithStatus, timeout)
  }

  private val KnownErrors = List(
    "org.im4java.core.CommandException"
  )

  private def isAKnownError(res: ResponseWrapper): Boolean =
    res.statusCode == 500 && KnownErrors.exists(res.bodyAsString.contains(_))
}


