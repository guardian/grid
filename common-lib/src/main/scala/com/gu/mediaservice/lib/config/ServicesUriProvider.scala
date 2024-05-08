package com.gu.mediaservice.lib.config

trait ServicesUriProvider {

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
