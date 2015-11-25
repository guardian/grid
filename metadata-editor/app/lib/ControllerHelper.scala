package lib

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore

import lib.Config._

object ControllerHelper {

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUriTemplate, kahunaUri)

}
