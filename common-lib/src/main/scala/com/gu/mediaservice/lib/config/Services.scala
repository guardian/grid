package com.gu.mediaservice.lib.config

import com.gu.mediaservice.model.Instance

trait Services {

  def kahunaBaseUri(instance: Instance): String

  def apiBaseUri(instance: Instance): String

  def loaderBaseUri(instance: Instance): String

  def projectionBaseUri(instance: Instance): String

  def cropperBaseUri(instance: Instance): String

  def metadataBaseUri(instance: Instance): String

  def imgopsBaseUri(instance: Instance): String

  def usageBaseUri(instance: Instance): String

  def collectionsBaseUri(instance: Instance): String

  def leasesBaseUri(instance: Instance): String

  def authBaseUri(instance: Instance): String

  def guardianWitnessBaseUri: String

  def corsAllowedDomains(instance: Instance): Set[String]

  def redirectUriParam: String

  def redirectUriPlaceholder: String

  def loginUriTemplate(instance: Instance): String
}

protected class SingleHostServices(val domain: String) extends Services {
  override def kahunaBaseUri(instance: Instance): String =  vhostServiceName("", instance)

  override def apiBaseUri(instance: Instance): String = vhostServiceName("media-api", instance)

  override def loaderBaseUri(instance: Instance): String = vhostServiceName("image-loader", instance)

  override def projectionBaseUri(instance: Instance): String = vhostServiceName("projection", instance)

  override def cropperBaseUri(instance: Instance): String = vhostServiceName("cropper", instance)

  override def metadataBaseUri(instance: Instance): String = vhostServiceName("metadata-editor", instance)

  override def imgopsBaseUri(instance: Instance): String=  vhostServiceName("imgproxy", instance)

  override def usageBaseUri(instance: Instance): String = vhostServiceName("usage", instance)

  override def collectionsBaseUri(instance: Instance): String = vhostServiceName("collections", instance)

  override def leasesBaseUri(instance: Instance): String = vhostServiceName("leases", instance)

  override def authBaseUri(instance: Instance): String = vhostServiceName("auth", instance)

  private def thrallBaseUri(instance: Instance): String = vhostServiceName("thrall", instance)

  val guardianWitnessBaseUri: String = "https://n0ticeapis.com"

  override def corsAllowedDomains(instance: Instance): Set[String] = Set(kahunaBaseUri(instance), apiBaseUri(instance), thrallBaseUri(instance))

  val redirectUriParam = "redirectUri"
  val redirectUriPlaceholder = s"{?$redirectUriParam}"
  def loginUriTemplate(instance: Instance): String = s"${authBaseUri(instance)}/login$redirectUriPlaceholder"

  private def vhostServiceName(serviceName: String, instance: Instance): String = {
    val vhost = instance.id
    s"https://$vhost.$domain/" + serviceName
  }
}

