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

protected class SingleHostServices(val hostname: String, val baseport: Int) extends Services {
  val kahunaBaseUri: String = baseUri(hostname, baseport + 20)

  val apiBaseUri: String = baseUri(hostname, baseport + 1)

  val loaderBaseUri: String = baseUri(hostname, baseport + 3)

  val projectionBaseUri: String = loaderBaseUri

  val cropperBaseUri: String = baseUri(hostname, baseport + 6)

  val metadataBaseUri: String = baseUri(hostname, baseport + 7)

  val imgopsBaseUri: String = baseUri(hostname, baseport + 8)

  val usageBaseUri: String = baseUri(hostname, baseport + 9)

  val collectionsBaseUri: String = baseUri(hostname, baseport + 10)

  val leasesBaseUri: String = baseUri(hostname, baseport + 12)

  val authBaseUri: String = baseUri(hostname, baseport + 11)

  private val thrallBaseUri: String = baseUri(hostname, baseport + 200)

  val allInternalUris: Seq[String] = Seq(
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

  val corsAllowedDomains: Set[String] = Set(kahunaBaseUri, apiBaseUri, thrallBaseUri)

  val redirectUriParam = "redirectUri"
  val redirectUriPlaceholder = s"{?$redirectUriParam}"
  val loginUriTemplate = s"$authBaseUri/login$redirectUriPlaceholder"


  private def baseUri(host: String, port: Int) = s"http://$host:$port"

}

