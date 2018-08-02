package com.gu.mediaservice.lib.net

import java.net.{URI => JURI, URLDecoder, URLEncoder}

object URI {
  def encode(uri: String): String = URLEncoder.encode(uri, "UTF-8").replace("+", "%20")
  def decode(uri: String): String = URLDecoder.decode(uri, "UTF-8")

  def encodePlus(uri: String): String = uri.replace("+", "%2B")

  def ensureSecure(str: String): JURI = {
    val uri = JURI.create(str)

    val secureString : String = (Option(uri.getScheme), Option(uri.getHost)) match {
      case (Some("https"), _) => str
      case (Some("http"), Some(host)) => s"https://$host"
      case (_, _) => s"https://$str"
    }

    JURI.create(secureString)
  }
}
