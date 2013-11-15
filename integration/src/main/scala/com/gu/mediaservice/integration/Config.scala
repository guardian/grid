package com.gu.mediaservice.integration

import java.net.{URLEncoder, URL}, URLEncoder.encode


case class Config(loaderApi: URL, mediaApi: URL) {

  def imageEndpoint(id: String): String = new URL(mediaApi, "images/" + encode(id, "UTF-8")).toExternalForm

  val deleteIndexEndpoint: String = new URL(mediaApi, "delete-index").toExternalForm

  val imageLoadEndpoint: String = new URL(loaderApi, "images").toExternalForm

}
