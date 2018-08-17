package com.gu.mediaservice.lib.net

import java.net.{URLDecoder, URLEncoder}

object URI {
  def encode(uri: String): String = URLEncoder.encode(uri, "UTF-8").replace("+", "%20")
  def decode(uri: String): String = URLDecoder.decode(uri, "UTF-8")

  def encodePlus(uri: String): String = uri.replace("+", "%2B")
}
