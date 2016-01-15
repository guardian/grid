package com.gu.mediaservice.picdarexport.lib.media

import java.net.URI

import scala.concurrent.Future

import play.api.libs.json._
import play.api.Logger

import scalaj.http.{HttpOptions, Http}

import com.gu.mediaservice.picdarexport.lib.ExecutionContexts.usageApi
import com.gu.mediaservice.picdarexport.lib.{Config, LogHelper}
import com.gu.mediaservice.model.PrintUsageRequest

class UsageSendError(msg: String, e: Throwable = null) extends RuntimeException(msg, e)

trait UsageApi extends LogHelper {

  val mediaApiKey: String
  val postPrintUsageEndpointUrl: String

  import Config.{mediaApiConnTimeout, mediaApiReadTimeout}

  def postPrintUsage(usageRequest: Option[PrintUsageRequest]): Future[Unit] = Future {
    usageRequest.map(req => {
      val usageData = Json.stringify(Json.toJson(usageRequest))

      val expectedStatusCode = 202

      val receivedStatusCode = logDuration("UsageApi.postPrintUsage") {
        Http(postPrintUsageEndpointUrl)
          .header("content-type", "application/json")
          .header("X-Gu-Media-Key", mediaApiKey)
          .timeout(mediaApiConnTimeout, mediaApiReadTimeout)
          .postData(usageData)
          .asString
          .code
      }

      if (receivedStatusCode != expectedStatusCode){
        throw new UsageSendError(
          s"Usage update failed for POST to $postPrintUsageEndpointUrl for $usageData with status $receivedStatusCode!")
      }

    }).getOrElse(Unit)
  }

}
