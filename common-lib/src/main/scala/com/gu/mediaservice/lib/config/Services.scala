package com.gu.mediaservice.lib.config

trait Services {

  def kahunaBaseUri: String

  def apiBaseUri: String

  def loaderBaseUri: String

  def projectionBaseUri: String

  def cropperBaseUri: String

  def metadataBaseUri: String

  def imgopsBaseUri: String

  def usageBaseUri: String

  def collectionsBaseUri: String

  def leasesBaseUri: String

  def authBaseUri: String

  def allInternalUris: Seq[String]

  def guardianWitnessBaseUri: String

  def corsAllowedDomains: Set[String]

  def redirectUriParam: String

  def redirectUriPlaceholder: String

  def loginUriTemplate: String

}

case class ServiceHosts(
                         kahunaPrefix: String,
                         apiPrefix: String,
                         loaderPrefix: String,
                         projectionPrefix: String,
                         cropperPrefix: String,
                         metadataPrefix: String,
                         imgopsPrefix: String,
                         usagePrefix: String,
                         collectionsPrefix: String,
                         leasesPrefix: String,
                         authPrefix: String,
                         thrallPrefix: String
                       )

object ServiceHosts {
  // this is tightly coupled to the Guardian's deployment.
  // TODO make more generic but w/out relying on Play config
  def guardianPrefixes: ServiceHosts = {
    val rootAppName: String = "media"

    ServiceHosts(
      kahunaPrefix = s"$rootAppName.",
      apiPrefix = s"api.$rootAppName.",
      loaderPrefix = s"loader.$rootAppName.",
      projectionPrefix = s"loader-projection.$rootAppName",
      cropperPrefix = s"cropper.$rootAppName.",
      metadataPrefix = s"$rootAppName-metadata.",
      imgopsPrefix = s"$rootAppName-imgops.",
      usagePrefix = s"$rootAppName-usage.",
      collectionsPrefix = s"$rootAppName-collections.",
      leasesPrefix = s"$rootAppName-leases.",
      authPrefix = s"$rootAppName-auth.",
      thrallPrefix = s"thrall.$rootAppName."
    )
  }
}

class GuardianUrlSchemeServices(val domainRoot: String, hosts: ServiceHosts, corsAllowedOrigins: Set[String], domainRootOverride: Option[String] = None) extends Services {
  private val kahunaHost: String = s"${hosts.kahunaPrefix}$domainRoot"
  private val apiHost: String = s"${hosts.apiPrefix}$domainRoot"
  private val loaderHost: String = s"${hosts.loaderPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val cropperHost: String = s"${hosts.cropperPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val metadataHost: String = s"${hosts.metadataPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val imgopsHost: String = s"${hosts.imgopsPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val usageHost: String = s"${hosts.usagePrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val collectionsHost: String = s"${hosts.collectionsPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val leasesHost: String = s"${hosts.leasesPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val authHost: String = s"${hosts.authPrefix}$domainRoot"
  private val projectionHost: String = s"${hosts.projectionPrefix}${domainRootOverride.getOrElse(domainRoot)}"
  private val thrallHost: String = s"${hosts.thrallPrefix}${domainRootOverride.getOrElse(domainRoot)}"

  val kahunaBaseUri = baseUri(kahunaHost)
  val apiBaseUri = baseUri(apiHost)
  val loaderBaseUri = baseUri(loaderHost)
  val projectionBaseUri = baseUri(projectionHost)
  val cropperBaseUri = baseUri(cropperHost)
  val metadataBaseUri = baseUri(metadataHost)
  val imgopsBaseUri = baseUri(imgopsHost)
  val usageBaseUri = baseUri(usageHost)
  val collectionsBaseUri = baseUri(collectionsHost)
  val leasesBaseUri = baseUri(leasesHost)
  val authBaseUri = baseUri(authHost)
  val thrallBaseUri = baseUri(thrallHost)

  val allInternalUris = Seq(
    kahunaBaseUri,
    apiBaseUri,
    loaderBaseUri,
    cropperBaseUri,
    metadataBaseUri,
    usageBaseUri,
    collectionsBaseUri,
    leasesBaseUri,
    authBaseUri,
    thrallBaseUri
  )

  val guardianWitnessBaseUri: String = "https://n0ticeapis.com"

  val corsAllowedDomains: Set[String] = corsAllowedOrigins.map(baseUri) + kahunaBaseUri + apiBaseUri + thrallBaseUri

  val redirectUriParam = "redirectUri"
  val redirectUriPlaceholder = s"{?$redirectUriParam}"
  val loginUriTemplate = s"$authBaseUri/login$redirectUriPlaceholder"

  private def baseUri(host: String) = s"https://$host"
}
