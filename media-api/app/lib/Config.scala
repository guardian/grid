package lib

import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{PropertiesConfig, CommonPlayAppConfig}


object Config extends PropertiesConfig("media-api") with CommonPlayAppConfig {

  val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map("Stage" -> Seq(stage), "Role" -> Seq(elasticsearchRole)))

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val s3Bucket: String = properties("s3.bucket")

  val topicArn: String = properties("sns.topic.arn")

  private lazy val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

}
