package lib

import com.amazonaws.services.ec2.{AmazonEC2, AmazonEC2ClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.elasticsearch.EC2
import play.api.Configuration

class ThrallConfig(override val configuration: Configuration) extends CommonConfig {
  private lazy val ec2Client: AmazonEC2 = withAWSCredentials(AmazonEC2ClientBuilder.standard()).build()

  final override lazy val appName = "thrall"

  def queueUrl: String = properties("sqs.queue.url")

  val imageBucket: String = properties("s3.image.bucket")

  val writeAlias = properties("es.index.aliases.write")

  val thumbnailBucket: String = properties("s3.thumb.bucket")

  val elasticsearchHost: String =
    if (stage == "DEV")
      properties.getOrElse("es.host", "localhost")
    else
      EC2.findElasticsearchHost(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App"   -> Seq(elasticsearchApp)
      ))

  // The presence of this identifier prevents deletion
  val persistenceIdentifier = properties("persistence.identifier")

  val healthyMessageRate: Int = properties("sqs.message.min.frequency").toInt

  val dynamoTopicArn: String = properties("indexed.image.sns.topic.arn")
}
