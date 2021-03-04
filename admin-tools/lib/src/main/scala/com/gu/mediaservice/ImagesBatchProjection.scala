package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.GridClient.{Error, Found => GridFound, NotFound => GridNotFound, Response}
import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.model.Image
import play.api.libs.ws.WSRequest

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, ExecutionContextExecutor, Future}

class ImagesBatchProjection(apiKey: String, timeout: Duration, gridClient: GridClient, maxSize: Int, projectionEndpoint: String) extends ApiKeyAuthentication {

  private implicit val ThrottledExecutionContext: ExecutionContextExecutor = ExecutionContext.fromExecutor(java.util.concurrent.Executors.newFixedThreadPool(5))

  private def authFunction(request: WSRequest): WSRequest = request.withHttpHeaders((apiKeyHeaderName, apiKey))

  def assertApiKeyIsValid: Boolean = {
    val f = gridClient.validateApiKey(projectionEndpoint, authFunction)
    Await.result(f, timeout)
  }

  def getImagesProjection(mediaIds: List[String], projectionEndpoint: String,
                          InputIdsStore: InputIdsStore): List[Either[Image, String]] = Await.result(
    Future.sequence(
      mediaIds.map { id =>
        val projectionUrl = new URL(s"$projectionEndpoint/$id")
        class FailedCallException extends Exception
        gridClient.makeGetRequestAsync(projectionUrl, authFunction) map {
          case GridFound(json, underlying) =>
            if (underlying.body.length > maxSize) {
              InputIdsStore.setStateToTooBig(id, underlying.body.length)
              Right(id)
            } else {
              Left(json.as[Image])
            }
          case GridNotFound(_, _) =>
            InputIdsStore.updateStateToNotFoundImage(id)
            Right(id)
          case e@Error(_, _, _) =>
            if (isAKnownError(e)) {
              InputIdsStore.setStateToKnownError(id)
              throw new FailedCallException()
            } else {
              InputIdsStore.setStateToUnknownError(id)
              throw new FailedCallException()
            }
        }
      }
    ), timeout)

  private trait GetImageStatus
  private case object Found extends GetImageStatus
  private case object NotFound extends GetImageStatus
  private case object Failed extends GetImageStatus
  case class ImagesWithStatus(found: List[String], notFound: List[String], failed: List[String])

  class FailureException extends Exception
  def getImages(mediaIds: List[String], imagesEndpoint: String,
                          InputIdsStore: InputIdsStore): ImagesWithStatus = {
    val apiCalls = mediaIds.map { id =>
      val imagesUrl = new URL(s"$imagesEndpoint/$id")
      gridClient.makeGetRequestAsync(imagesUrl, authFunction) map {
        case GridFound(_, _) => (id, Found)
        case GridNotFound(_, _) => (id, NotFound)
        case Error(_, _, _) => (id, Failed)
      }
    }
    val futureResults = Future.sequence(apiCalls)
    val futureImagesWithStatus = futureResults.map{results =>
      val found = results.collect{case (id, Found) => id}
      val notFound = results.collect{case (id, NotFound) => id}
      val failed = results.collect{case (id, Failed) => id}
      ImagesWithStatus(found,notFound,failed)
    }
    Await.result(futureImagesWithStatus, timeout)
  }

  private val KnownErrors = List(
    "org.im4java.core.CommandException",
    "End of data reached."
  )

  private def isAKnownError(res: Response): Boolean =
    res.status == 500 && KnownErrors.exists(res.underlying.body.contains(_))
}


