package com.gu.mediaservice.picdarexport.lib.media

import java.net.{SocketTimeoutException, URI}

import com.gu.mediaservice.picdarexport.lib.{Config, LogHelper, HttpClient}
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json.Json

import scala.concurrent.Future
import com.gu.mediaservice.picdarexport.lib.ExecutionContexts.mediaService

import scalaj.http.Http

case class LoaderUploadError(message: String) extends Exception(message)

trait MediaLoader extends HttpClient with LogHelper {

  import Config.{loaderConnTimeout, loaderReadTimeout}

  val loaderEndpointUrl: String
  val loaderApiKey: String

  def upload(data: Array[Byte], picdarUrn: String, uploadTime: DateTime): Future[URI] =
    postData(data, loaderParams(picdarUrn, uploadTime))

  private def postData(data: Array[Byte], parameters: Map[String, String]): Future[URI] = Future {
    logDuration(s"MediaLoader.postData (${data.length} bytes)") {
      val resp = Http(loaderEndpointUrl).
        params(parameters).
        header("X-Gu-Media-Key", loaderApiKey).
        // Disable gzip as library doesn't seem to correctly decode response, and
        // it's tiny anyway
        compress(false).
        // Patience is the mother of all virtues
        timeout(loaderConnTimeout, loaderReadTimeout).
        postData(data).
        asString

      val respJson = Json.parse(resp.body)
      val mediaUri = (respJson \ "uri").as[String]
      URI.create(mediaUri)
    }
  } recoverWith {
    case ex: SocketTimeoutException => Future.failed(LoaderUploadError(ex.getMessage))
  }

  val uploadTimeFormat = ISODateTimeFormat.dateTimeNoMillis()
  private def loaderParams(picdarUrn: String, uploadTime: DateTime): Map[String, String] = {
    val identifiers = Json.stringify(Json.obj("picdarUrn" -> picdarUrn))
    val uploadTimeStr = uploadTimeFormat print uploadTime
    Map("identifiers" -> identifiers, "uploadTime" -> uploadTimeStr)
  }


}
