package com.gu.mediaservice.lib.config

case class ServiceHosts(kahunaPrefix: String, apiPrefix: String, loaderPrefix: String,
                        cropperPrefix: String, metadataPrefix: String, imgopsPrefix: String,
                        usagePrefix: String, collectionsPrefix: String, leasesPrefix: String,
                        authPrefix: String)

class Services(val domainRoot: String, isProd: Boolean, hosts: ServiceHosts) {
  val kahunaHost: String      = s"${hosts.kahunaPrefix}$domainRoot"
  val apiHost: String         = s"${hosts.apiPrefix}$domainRoot"
  val loaderHost: String      = s"${hosts.loaderPrefix}$domainRoot"
  val cropperHost: String     = s"${hosts.cropperPrefix}$domainRoot"
  val metadataHost: String    = s"${hosts.metadataPrefix}$domainRoot"
  val imgopsHost: String      = s"${hosts.imgopsPrefix}$domainRoot"
  val usageHost: String       = s"${hosts.usagePrefix}$domainRoot"
  val collectionsHost: String = s"${hosts.collectionsPrefix}$domainRoot"
  val leasesHost: String      = s"${hosts.leasesPrefix}$domainRoot"
  val authHost: String        = s"${hosts.authPrefix}$domainRoot"

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
