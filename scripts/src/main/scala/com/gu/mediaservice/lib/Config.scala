package lib

import java.io.File

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.amazonaws.services.ec2.AmazonEC2Client
import scala.io.Source._
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig}


object Config {
  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")

  private def stageFromFile: Option[String] = {
    val file = new File("/etc/gu/stage")
    if (file.exists) Some(fromFile(file).mkString.trim) else None
  }

  final val stage: String = stageFromFile getOrElse "DEV"
  final val awsEndpoint = "ec2.eu-west-1.amazonaws.com"
  final val elasticsearchStack = "media-service"
  final val elasticsearchApp   = "elasticsearch"

  val properties = Properties.fromPath("/etc/gu/thrall.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))
  val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

  val elasticsearchCluster = "media-api"
  val elasticsearchPort: Int = 9300
  val elasticsearchHost: String =
    if (stage == "DEV")
      "localhost"
    else
      findElasticsearchHost(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App"   -> Seq(elasticsearchApp)
      ))

}