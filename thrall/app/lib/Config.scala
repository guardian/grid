package lib

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config.{Config, PropertiesConfig}
import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.amazonaws.services.ec2.AmazonEC2Client

object Config extends Config {

  private lazy val properties: Map[String, String] =
    PropertiesConfig.fromFile("/etc/gu/thrall.properties")

  def queueUrl: String = properties("sqs.queue.url")

  val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map("Stage" -> Seq(stage), "Role" -> Seq(elasticsearchRole)))

  lazy val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  private lazy val ec2Client: AmazonEC2Client = {
    val client = new AmazonEC2Client(awsCredentials)
    client.setEndpoint("ec2.eu-west-1.amazonaws.com")
    client
  }

}
