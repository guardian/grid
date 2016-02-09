package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val appName = "auth"

  val properties = Properties.fromPath("/etc/gu/auth.properties")

  val loginUriTemplate: String = services.loginUriTemplate
  val rootUri: String = services.authBaseUri
  val mediaApiUri: String = services.apiBaseUri

  private lazy val corsAllowedOrigins = properties.getOrElse("cors.allowed.origins", "").split(",").toList
  lazy val corsAllAllowedOrigins: List[String] =
    services.kahunaBaseUri :: corsAllowedOrigins
}
