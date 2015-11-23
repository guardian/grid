package controllers

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import lib.Config

object Authed {
  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val action = auth.Authenticated(keyStore, Config.loginUriTemplate, Config.kahunaUri)
}
