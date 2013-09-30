package lib


import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config.{Config, PropertiesConfig}
import com.gu.mediaservice.lib.elasticsearch.EC2._


object Config extends Config {

 val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map("Stage" -> Seq(stage), "Role" -> Seq(elasticsearchRole)))

  private lazy val properties: Map[String, String] =
    PropertiesConfig.fromFile("/etc/gu/media-api.conf")

  private lazy val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  private lazy val ec2Client: AmazonEC2Client = {
    val client = new AmazonEC2Client(awsCredentials)
    client.setEndpoint("ec2.eu-west-1.amazonaws.com")
    client
  }

}
