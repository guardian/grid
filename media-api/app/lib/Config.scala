package lib

import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig}


object Config extends CommonPlayAppConfig {

  val properties = Properties.fromPath("/etc/gu/media-api.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

  val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map("Stage" -> Seq(stage), "Role" -> Seq(elasticsearchRole)))

  val imageBucket: String = properties("s3.image.bucket")
  val thumbBucket: String = properties("s3.thumb.bucket")

  val topicArn: String = properties("sns.topic.arn")

  val rootUri: String = string("root.uri")
  val domainRoot: String = string("domain.root")

  val corsAllowedDomain: String =
    properties.getOrElse("cors.allowed.domain", domainRoot)

}
