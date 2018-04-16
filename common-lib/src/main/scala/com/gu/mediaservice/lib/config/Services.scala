package com.gu.mediaservice.lib.config

class Services(val domainRoot: String) {
  val appName = "media"

  val kahunaHost: String   = domainRoot
  val apiHost: String      = s"api.$domainRoot"
  val loaderHost: String   = s"loader.$domainRoot"
  val cropperHost: String  = s"cropper.$domainRoot"
  val metadataHost: String = s"$appName-metadata.$domainRoot"
  val imgopsHost: String   = s"$appName-imgops.$domainRoot"
  val usageHost: String    = s"$appName-usage.$domainRoot"
  val collectionsHost: String = s"$appName-collections.$domainRoot"
  val leasesHost: String   = s"$appName-leases.$domainRoot"
  val authHost: String     = s"$appName-auth.$domainRoot"

  val composerHost: String     = s"composer.$domainRoot"

  val kahunaBaseUri      = baseUri(kahunaHost)
  val apiBaseUri         = baseUri(apiHost)
  val loaderBaseUri      = baseUri(loaderHost)
  val cropperBaseUri     = baseUri(cropperHost)
  val metadataBaseUri    = baseUri(metadataHost)
  val imgopsBaseUri      = baseUri(imgopsHost)
  val usageBaseUri       = baseUri(usageHost)
  val collectionsBaseUri = baseUri(collectionsHost)
  val leasesBaseUri      = baseUri(leasesHost)
  val authBaseUri        = baseUri(authHost)

  val composerBaseUri    = baseUri(composerHost)

  val loginUriTemplate = s"$authBaseUri/login{?redirectUri}"

  def baseUri(host: String) = {
    s"https://$host"
  }
}
