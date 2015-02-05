package com.gu.mediaservice.picdarexport.lib.media

import java.net.URI

import com.gu.mediaservice.picdarexport.lib.HttpClient
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.libs.json.Json

import scala.concurrent.Future
import com.gu.mediaservice.picdarexport.lib.ExecutionContexts.mediaService


trait MediaLoader extends HttpClient {

  val loaderEndpointUrl: String
  val loaderApiKey: String

  def upload(data: Array[Byte], picdarUrn: String, uploadTime: DateTime): Future[URI] =
    postData(data, loaderParams(picdarUrn, uploadTime))

  private def postData(data: Array[Byte], parameters: Map[String, String]): Future[URI] = {
    val request = WS.url(loaderEndpointUrl).
      withQueryString(parameters.toSeq: _*).
      withHeaders("X-Gu-Media-Key" -> loaderApiKey).
      post(data)

    request map { response =>
      URI.create((response.json \ "uri").as[String])
    }
  }

  val uploadTimeFormat = ISODateTimeFormat.dateTimeNoMillis()
  private def loaderParams(picdarUrn: String, uploadTime: DateTime): Map[String, String] = {
    val identifiers = Json.stringify(Json.obj("picdarUrn" -> picdarUrn))
    val uploadTimeStr = uploadTimeFormat print uploadTime
    Map("identifiers" -> identifiers, "uploadTime" -> uploadTimeStr)
  }


}
