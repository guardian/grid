package com.gu.mediaservice.lib.config

class Services(val domainRoot: String, isProd: Boolean) {
  val appName = "media"

  val kahunaHost: String   = s"$appName.$domainRoot"
  val apiHost: String      = s"api.$appName.$domainRoot"
  val loaderHost: String   = s"loader.$appName.$domainRoot"
  val cropperHost: String  = s"cropper.$appName.$domainRoot"
  val metadataHost: String = s"$appName-metadata.$domainRoot"
  val imgopsHost: String   = s"$appName-imgops.$domainRoot"
  val usageHost: String    = s"$appName-usage.$domainRoot"
  val collectionsHost: String = s"$appName-collections.$domainRoot"
  val leasesHost: String   = s"$appName-leases.$domainRoot"
  val authHost: String     = s"$appName-auth.$domainRoot"

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

  val guardianWitnessBaseUri: String = "https://n0ticeapis.com"

  val toolsDomains: Set[String] = if(isProd) {
    Set(domainRoot)
  } else {
    Set(
      domainRoot.replace("test", "local"),
      domainRoot.replace("test", "code")
    )
  }

  // TODO move to config
  val corsAllowedTools: Set[String] = toolsDomains.foldLeft(Set[String]()) {(acc, domain) => {
    val tools = Set(
      baseUri(s"composer.$domain"),
      baseUri(s"fronts.$domain")
    )

    acc ++ tools
  }}

  val loginUriTemplate = s"$authBaseUri/login{?redirectUri}"

  def baseUri(host: String) = {
    s"https://$host"
  }
}
