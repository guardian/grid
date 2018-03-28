package auth

import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.config.{CommonConfig, Properties}
import play.api.Configuration

import scala.concurrent.ExecutionContext

class AuthConfig(override val configuration: Configuration)(implicit ec: ExecutionContext) extends CommonConfig {

  val appName = "auth"

  val properties = Properties.fromPath("/etc/gu/auth.properties")

  val configBucket: String = properties("s3.config.bucket")
  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val keyStore = new KeyStore(keyStoreBucket, awsCredentials)

  val loginUriTemplate: String = services.loginUriTemplate
  val rootUri: String = services.authBaseUri
  val mediaApiUri: String = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri
}
