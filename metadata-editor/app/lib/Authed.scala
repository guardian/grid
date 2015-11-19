package lib

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore

object Authed {
  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val action = auth.Authenticated(keyStore, Config.loginUriTemplate, Config.kahunaUri)
}
