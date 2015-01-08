package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val properties = Properties.fromPath("/etc/gu/kahuna.properties")

  val rootUri: String = services.kahunaBaseUri
  val mediaApiUri: String = services.apiBaseUri

  val keyStoreBucket: String = properties("auth.keystore.bucket")
  val mixpanelToken: Option[String] = properties.get("mixpanel.token")
  val sentryDsn: Option[String] = properties.get("sentry.dsn")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

}
