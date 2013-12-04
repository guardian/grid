package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig}
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object Config extends CommonPlayAppConfig {

  val properties = Properties.fromPath("/etc/gu/kahuna.properties")

  val domainRoot: String = string("domain.root")

  val mediaApiUri: String =
    properties.getOrElse("mediaapi.uri", s"https://api.$domainRoot")

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

}
