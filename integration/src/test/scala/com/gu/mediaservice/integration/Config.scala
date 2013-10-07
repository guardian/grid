package com.gu.mediaservice.integration

import com.gu.mediaservice.lib.config.Properties
import java.net.{URLEncoder, URL}, URLEncoder.encode


object Config {

  val properties = Properties.fromURL(getClass.getResource("/integration.properties"))

  val loaderApi: URL = new URL(properties("loader.api.url"))

  val mediaApi: URL = new URL(properties("media.api.url"))

  def imageLoadEndpoint(id: String): URL = new URL(loaderApi, "image/" + encode(id, "UTF-8"))

  def imageEndpoint(id: String): URL = new URL(mediaApi, "image/" + encode(id, "UTF-8"))

  val deleteIndexEndpoint: URL = new URL(mediaApi, "delete-index")

}
