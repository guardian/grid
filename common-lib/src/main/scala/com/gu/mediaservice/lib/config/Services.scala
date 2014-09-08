package com.gu.mediaservice.lib.config

class Services(domainRoot: String, ssl: Boolean) {

  val kahunaHost: String   = domainRoot
  val apiHost: String      = s"api.$domainRoot"
  val loaderHost: String   = s"loader.$domainRoot"
  val cropperHost: String  = s"cropper.$domainRoot"

  val kahunaUri       = baseUri(kahunaHost)
  val apiBaseUri      = baseUri(apiHost)
  val loaderBaseUri   = baseUri(loaderHost)
  val cropperBaseUri  = baseUri(cropperHost)

  def baseUri(host: String) = {
    val protocol = if (ssl) "https" else "http"
    s"$protocol://$host"
  }
}
