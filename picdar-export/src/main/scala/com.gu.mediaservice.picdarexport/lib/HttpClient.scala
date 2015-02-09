package com.gu.mediaservice.picdarexport.lib

import java.net.URI

import scala.concurrent._
import scalaj.http.Http

trait HttpClient extends LogHelper {

  import Config.{picdarAssetConnTimeout, picdarAssetReadTimeout}

  def readBytes(uri: URI)(implicit executionContext: ExecutionContext): Future[Array[Byte]] = Future { logDuration("HttpClient.readBytes") {
    Http(uri.toString).
      timeout(picdarAssetConnTimeout, picdarAssetReadTimeout).
      asBytes.
      body
  } }

}
