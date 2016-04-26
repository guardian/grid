package lib

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.{PermissionStore, KeyStore}

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val appName = "auth"

  val properties = Properties.fromPath("/etc/gu/auth.properties")

  val configBucket: String = properties("s3.config.bucket")
  val keyStoreBucket: String = properties("auth.keystore.bucket")
  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)

  val loginUriTemplate: String = services.loginUriTemplate
  val rootUri: String = services.authBaseUri
  val mediaApiUri: String = services.apiBaseUri
  val kahunaUri = services.kahunaBaseUri

  private lazy val corsAllowedOrigins = properties.getOrElse("cors.allowed.origins", "").split(",").toList
  lazy val corsAllAllowedOrigins: List[String] =
    services.kahunaBaseUri :: corsAllowedOrigins
}
