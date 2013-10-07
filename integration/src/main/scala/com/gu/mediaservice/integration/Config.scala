package com.gu.mediaservice.integration

import java.net.{URLEncoder, URL}, URLEncoder.encode


case class Config(loaderApi: URL, mediaApi: URL) {

  def imageLoadEndpoint(id: String): URL = new URL(loaderApi, "image/" + encode(id, "UTF-8"))

  def imageEndpoint(id: String): URL = new URL(mediaApi, "image/" + encode(id, "UTF-8"))

  val deleteIndexEndpoint: URL = new URL(mediaApi, "delete-index")

}
