package com.gu.mediaservice.picdarexport.lib

import java.net.URI

import scala.concurrent._
import scalaj.http.Http

trait HttpClient {

  def readBytes(uri: URI)(implicit executionContext: ExecutionContext): Future[Array[Byte]] = Future {
    Http(uri.toString).asBytes.body
  }

}
