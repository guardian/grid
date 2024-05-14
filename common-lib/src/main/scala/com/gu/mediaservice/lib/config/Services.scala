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

  def guardianWitnessBaseUri: String

  def corsAllowedDomains: Set[String]

  def redirectUriParam: String

  def redirectUriPlaceholder: String

  def loginUriTemplate: String

  def apiInternalBaseUri: String

  def collectionsInternalBaseUri: String

  def cropperInternalBaseUri: String

  def leasesInternalBaseUri: String

  def metadataInternalBaseUri: String

  def projectionInternalBaseUri: String

  def usageInternalBaseUri: String
}

protected class SingleHostServices(val rootUrl: String) extends Services {
  val kahunaBaseUri: String = rootUrl

  val apiBaseUri: String = subpathedServiceBaseUri("media-api")

  val loaderBaseUri: String = subpathedServiceBaseUri("image-loader")

  val projectionBaseUri: String = loaderBaseUri

  val cropperBaseUri: String = subpathedServiceBaseUri("cropper")

  val metadataBaseUri: String = subpathedServiceBaseUri("metadata-editor")

  val imgopsBaseUri: String = subpathedServiceBaseUri("imgops")

  val usageBaseUri: String =subpathedServiceBaseUri("usage")

  val collectionsBaseUri: String = subpathedServiceBaseUri("collections")

  val leasesBaseUri: String = subpathedServiceBaseUri("leases")

  val authBaseUri: String = subpathedServiceBaseUri("auth")

  private val thrallBaseUri: String =  subpathedServiceBaseUri("thrall")

  val guardianWitnessBaseUri: String = "https://n0ticeapis.com"

  val corsAllowedDomains: Set[String] = Set(kahunaBaseUri, apiBaseUri, thrallBaseUri)

  val redirectUriParam = "redirectUri"
  val redirectUriPlaceholder = s"{?$redirectUriParam}"
  val loginUriTemplate = s"$authBaseUri/login$redirectUriPlaceholder"

  val apiInternalBaseUri: String = internalServiceBaseUri("media-api", 9000)
  val collectionsInternalBaseUri: String = internalServiceBaseUri("collections", 9000)
  val cropperInternalBaseUri: String = internalServiceBaseUri("cropper", 9000)
  val leasesInternalBaseUri: String = internalServiceBaseUri("leases", 9000)
  val metadataInternalBaseUri: String = internalServiceBaseUri("metadata-editor", 9000)
  val projectionInternalBaseUri: String = internalServiceBaseUri("projection", 9000)
  val usageInternalBaseUri: String = internalServiceBaseUri("usages", 9000)

  private def subpathedServiceBaseUri(serviceName: String): String = s"$rootUrl/$serviceName"

  private def internalServiceBaseUri(host: String, port: Int) = s"http://$host:$port"

}

