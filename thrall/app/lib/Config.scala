package lib

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.amazonaws.services.ec2.AmazonEC2Client
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{CommonPlayAppConfig, PropertiesConfig}


object Config extends PropertiesConfig("thrall") with CommonPlayAppConfig {

  def queueUrl: String = properties("sqs.queue.url")

  val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map("Stage" -> Seq(stage), "Role" -> Seq(elasticsearchRole)))

  lazy val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  private lazy val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

}
