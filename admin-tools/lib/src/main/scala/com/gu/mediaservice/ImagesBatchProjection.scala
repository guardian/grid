package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.model.Image

import scala.concurrent.duration.{DAYS, Duration, HOURS}
import scala.concurrent.{Await, ExecutionContext, Future}

class ImagesBatchProjection(apiKey: String, timeout: Duration, gridClient: GridClient, maxSize: Int) {

  private implicit val ThrottledExecutionContext = ExecutionContext.fromExecutor(java.util.concurrent.Executors.newFixedThreadPool(5))

  // TODO I don't like this - checking the API key by making a request to a non-existent endpoint is ... ewww.
  def validateApiKey(projectionEndpoint: String): Unit = {
    val projectionUrl = new URL(s"$projectionEndpoint/not-exists")
    for {
      _ <- gridClient.makeGetRequestAsync(
        projectionUrl,
        apiKey,
        None,
        {res:ResponseWrapper => None},
        {res:ResponseWrapper => None}
      )
    } yield Unit
  }

  def getImagesProjection(mediaIds: List[String], projectionEndpoint: String,
                          InputIdsStore: InputIdsStore): List[Either[Image, String]] = {
    val apiCalls = mediaIds.map { id =>
      val projectionUrl = new URL(s"$projectionEndpoint/$id")
      class FailedCallException extends Exception
      gridClient.makeGetRequestAsync[Either[Image, String]](
        projectionUrl,
        apiKey,
        None,
        { response: ResponseWrapper =>
          if (response.bodyAsString.size > maxSize) {
            InputIdsStore.setStateToTooBig(id, response.bodyAsString.size)
            None
          } else {
            Some(Left(response.body.as[Image]))
          }
        },
        { _: ResponseWrapper => {
            InputIdsStore.updateStateToNotFoundImage(id)
            Some(Right(id))
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
      ).recoverWith({case _:FailedCallException => ???})
    }
    val f = Future.sequence(apiCalls)
    Await.result(f, timeout).flatten
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
        apiKey,
        None,
        {_:ResponseWrapper => Some((id, Found))},
        {_:ResponseWrapper => Some((id, NotFound))},
        Some({_:ResponseWrapper => new FailureException()})
      ).recoverWith({case _: FailureException => Future.successful(Some((id, Failed)))})
    }
    val futureResults = Future.sequence(apiCalls)
    val futureImagesWithStatus = futureResults.map{results =>
      val found = results.collect{case Some((id, Found))=> id}
      val notFound = results.collect{case Some((id, NotFound)) => id}
      val failed = results.collect{case Some((id, Failed)) => id}
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


