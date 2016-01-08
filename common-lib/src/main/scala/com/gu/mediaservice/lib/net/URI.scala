package com.gu.mediaservice.lib.net

import java.net.{URLDecoder, URLEncoder}

object URI {
  def encode(uri: String) = URLEncoder.encode(uri, "UTF-8")
  def decode(uri: String) = URLDecoder.decode(uri, "UTF-8")
}
