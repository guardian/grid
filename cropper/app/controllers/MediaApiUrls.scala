package controllers

trait MediaApiUrls {

  def isMediaApiImageUri(uri: String, apiUri: String): Boolean = {
    val hasMediaApiPrefix = uri.startsWith(apiUri)
    val suffix = uri.drop(apiUri.length)
    val suffixComponents = suffix.split("/")
    val hasImageSuffix = suffixComponents.length == 3 && suffixComponents(1) == "images"
    hasMediaApiPrefix && hasImageSuffix
  }

  def imageIdFrom(uri: String): String = {
    uri.split("/").last
  }
}
