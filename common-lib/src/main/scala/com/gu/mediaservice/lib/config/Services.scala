package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model.Instance

trait Services {

  def kahunaBaseUri: String

  def apiBaseUri(instance: Instance): String

  def loaderBaseUri(instance: Instance): String

  def projectionBaseUri(instance: Instance): String

  def cropperBaseUri(instance: Instance): String

  def metadataBaseUri(instance: Instance): String

  def imgopsBaseUri(instance: Instance): String

  def usageBaseUri(instance: Instance): String

  def collectionsBaseUri(instance: Instance): String

  def leasesBaseUri(instance: Instance): String

  def authBaseUri: String

  def guardianWitnessBaseUri: String

  def corsAllowedDomains(instance: Instance): Set[String]

  def redirectUriParam: String

  def redirectUriPlaceholder: String

  def loginUriTemplate: String

}

protected class SingleHostServices(val rootUrl: String) extends Services {
  val kahunaBaseUri: String = rootUrl

  override def apiBaseUri(instance: Instance): String = vhostServiceName("media-api", instance)

  override def loaderBaseUri(instance: Instance): String = vhostServiceName("image-loader", instance)

  override def projectionBaseUri(instance: Instance): String = vhostServiceName("projection", instance)

  override def cropperBaseUri(instance: Instance): String = vhostServiceName("cropper", instance)

  override def metadataBaseUri(instance: Instance): String = vhostServiceName("metadata-editor", instance)

  override def imgopsBaseUri(instance: Instance): String=  vhostServiceName("imgproxy", instance)

  override def usageBaseUri(instance: Instance): String = vhostServiceName("usage", instance)

  override def collectionsBaseUri(instance: Instance): String = vhostServiceName("collections", instance)

  override def leasesBaseUri(instance: Instance): String = vhostServiceName("leases", instance)

  val authBaseUri: String = subpathedServiceBaseUri("auth")

  private val thrallBaseUri: String =  subpathedServiceBaseUri("thrall")

  val guardianWitnessBaseUri: String = "https://n0ticeapis.com"

  override def corsAllowedDomains(instance: Instance): Set[String] = Set(kahunaBaseUri, apiBaseUri(instance), thrallBaseUri)

  val redirectUriParam = "redirectUri"
  val redirectUriPlaceholder = s"{?$redirectUriParam}"
  val loginUriTemplate = s"$authBaseUri/login$redirectUriPlaceholder"

  private def vhostServiceName(serviceName: String, instance: Instance): String = {
    val vhostRootUrl = instance.id
    s"https://$vhostRootUrl/" + serviceName
  }

  private def subpathedServiceBaseUri(serviceName: String): String = s"$rootUrl/$serviceName"
}

