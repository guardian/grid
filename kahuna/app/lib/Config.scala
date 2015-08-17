package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val appName = "kahuna"

  val properties = Properties.fromPath("/etc/gu/kahuna.properties")

  val loginUri: String = services.loginUri
  val rootUri: String = services.kahunaBaseUri
  val mediaApiUri: String = services.apiBaseUri

  val keyStoreBucket: String = properties("auth.keystore.bucket")
  val mixpanelToken: Option[String] = properties.get("mixpanel.token").filterNot(_.isEmpty)
  val sentryDsn: Option[String] = properties.get("sentry.dsn").filterNot(_.isEmpty)
  val watUri: Option[String] = properties.get("wat.uri").filterNot(_.isEmpty)

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

}
