package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.model.Image
import play.api.libs.ws.WSRequest

import scala.concurrent.duration.{DAYS, Duration, HOURS}
import scala.concurrent.{Await, ExecutionContext, Future}

class ImagesBatchProjection(apiKey: String, timeout: Duration, gridClient: GridClient, maxSize: Int, projectionEndpoint: String) extends ApiKeyAuthentication {

  private implicit val ThrottledExecutionContext = ExecutionContext.fromExecutor(java.util.concurrent.Executors.newFixedThreadPool(5))

  private def authFunction(request: WSRequest) = request.withHttpHeaders((apiKeyHeaderName, apiKey))

  def assertApiKeyIsValid = {
    val f = gridClient.validateApiKey(projectionEndpoint, authFunction)
    Await.result(f, timeout)
  }

  def getImagesProjection(mediaIds: List[String], projectionEndpoint: String,
                          InputIdsStore: InputIdsStore): List[Either[Image, String]] = {
    val apiCalls = mediaIds.map { id =>
      val projectionUrl = new URL(s"$projectionEndpoint/$id")
      class FailedCallException extends Exception
      gridClient.makeGetRequestAsync[Either[Image, String]](
        projectionUrl,
        authFunction,
          { response: ResponseWrapper =>
            if (response.bodyAsString.size > maxSize) {
              InputIdsStore.setStateToTooBig(id, response.bodyAsString.size)
              Right(id)
            } else {
              Left(response.body.as[Image])
            }
          },
        { _: ResponseWrapper => {
            InputIdsStore.updateStateToNotFoundImage(id)
            Right(id)
          }
        },
        Some({ res: ResponseWrapper => {
          if (isAKnownError(res)) {
            InputIdsStore.setStateToKnownError(id)
            new FailedCallException()
          } else {
            InputIdsStore.setStateToUnknownError(id)
            new FailedCallException()
          }
        }
      })
      )
    }
    val f = Future.sequence(apiCalls)
    Await.result(f, timeout)
  }

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
      gridClient.makeGetRequestAsync[(String, GetImageStatus)](
        imagesUrl,
        authFunction,
        {_:ResponseWrapper => (id, Found)},
        {_:ResponseWrapper => (id, NotFound)},
        Some({_:ResponseWrapper => new FailureException()})
      ).recoverWith({case _: FailureException => Future.successful((id, Failed))})
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

  private def isAKnownError(res: ResponseWrapper): Boolean =
    res.statusCode == 500 && KnownErrors.exists(res.bodyAsString.contains(_))
}


