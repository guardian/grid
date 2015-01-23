package com.gu.mediaservice.picdarexport.lib.media

import java.net.URI

import com.gu.mediaservice.picdarexport.lib.HttpClient
import play.api.Logger

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

trait MediaLoader extends HttpClient {

  val loaderEndpointUrl: String
  val loaderApiKey: String

  def upload(data: Array[Byte], parameters: Map[String, String]): Future[Option[URI]] = {
    val request = WS.url(loaderEndpointUrl).
      withQueryString(parameters.toSeq: _*).
      withHeaders("X-Gu-Media-Key" -> loaderApiKey).
      post(data)

    request map { response =>
      (response.json \ "uri").asOpt[String].map(URI.create)
    } recover { case e: Throwable =>
      Logger.warn(s"Upload error: $e")
      None
    }
  }
}
