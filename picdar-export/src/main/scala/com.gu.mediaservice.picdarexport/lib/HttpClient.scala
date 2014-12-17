package com.gu.mediaservice.picdarexport.lib

import java.net.URI

import com.ning.http.client.providers.netty.NettyResponse

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

trait HttpClient {
  val builder = new com.ning.http.client.AsyncHttpClientConfig.Builder()
  val WS = new play.api.libs.ws.ning.NingWSClient(builder.build())

  def readBytes(uri: URI): Future[Array[Byte]] = {
    WS.url(uri.toString).get map { response =>
      // TODO: can we pass the stream directy to the POST somehow?
      // FIXME: why is it such a pain in the ass to get the bytes out of the response?
      val resp = response.underlying[NettyResponse]
      resp.getResponseBodyAsBytes
    }
  }
}
