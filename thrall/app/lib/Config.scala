package lib

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.amazonaws.services.ec2.AmazonEC2Client
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig}


object Config extends CommonPlayAppConfig {

  val appName = "thrall"

  val properties = Properties.fromPath("/etc/gu/thrall.properties")

  def queueUrl: String = properties("sqs.queue.url")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))
  val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

  val imageBucket: String = properties("s3.image.bucket")

  val writeAlias = properties("es.index.aliases.write")

  val thumbnailBucket: String = properties("s3.thumb.bucket")

  val pngImageOpsBucket: String = properties("s3.png.bucket")

  val elasticsearchHost: String =
    if (stage == "DEV")
      properties.getOrElse("es.host", "localhost")
    else
      findElasticsearchHost(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App"   -> Seq(elasticsearchApp)
      ))

  // The presence of this identifier prevents deletion
  val persistenceIdentifier = properties("persistence.identifier")

  val healthyMessageRate = properties("sqs.message.min.frequency").toInt

  val dynamoTopicArn: String = properties("indexed.image.sns.topic.arn")
}
