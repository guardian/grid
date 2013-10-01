package lib

import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import scalaz.syntax.id._

import com.gu.mediaservice.lib.config
import com.gu.mediaservice.lib.elasticsearch.EC2._


object Config extends config.Config {

 val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map("Stage" -> Seq(stage), "Role" -> Seq(elasticsearchRole)))

 private lazy val properties: Map[String, String] =
   config.Properties.fromFile("/etc/gu/media-api.properties")

 private lazy val awsCredentials: AWSCredentials =
   new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

 private lazy val ec2Client: AmazonEC2Client =
   new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

}
