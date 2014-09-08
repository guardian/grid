package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val properties = Properties.fromPath("/etc/gu/kahuna.properties")

  val mediaApiUri: String = services.apiBaseUri

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

}
