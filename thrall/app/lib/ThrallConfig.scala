package lib

import com.amazonaws.services.ec2.AmazonEC2ClientBuilder
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.discovery.EC2
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import play.api.Configuration

class ThrallConfig(override val configuration: Configuration) extends CommonConfig {
  private lazy val ec2Client = withAWSCredentials(AmazonEC2ClientBuilder.standard()).build()

  final override lazy val appName = "thrall"

  lazy val queueUrl: String = properties("sqs.queue.url")

  lazy val imageBucket: String = properties("s3.image.bucket")

  lazy val writeAlias: String = properties.getOrElse("es.index.aliases.write", configuration.get[String]("es.index.aliases.write"))

  lazy val thumbnailBucket: String = properties("s3.thumb.bucket")

  lazy val elasticsearchHost: Option[String] = Some {
    if (isDev)
      properties.getOrElse("es.host", "localhost")
    else
      EC2.findElasticsearchHostByTags(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App" -> Seq(elasticsearchApp)
      ))
  }

  lazy val elasticsearchPort: Option[Int] = properties.get("es.port").map(_.toInt)
  lazy val elasticsearchCluster: Option[String] = properties.get("es.cluster")

  lazy val elasticsearch6Host: Option[String] =  {
    if (isDev)
      Some(properties.getOrElse("es6.host", "localhost"))
    else
      properties.get("es6.host")
  }

  lazy val elasticsearch6Port: Option[Int] = properties.get("es6.port").map(_.toInt)
  lazy val elasticsearch6Cluster: Option[String] = properties.get("es6.cluster")
  lazy val elasticsearch6Shards = Some(if (isDev) 1 else properties("es6.shards").toInt)
  lazy val elasticsearch6Replicas = Some(if (isDev) 0 else properties("es6.replicas").toInt)

  lazy val healthyMessageRate: Int = properties("sqs.message.min.frequency").toInt

  lazy val metadataTopicArn: String = properties("indexed.image.sns.topic.arn")

  lazy val from: Option[DateTime] = properties.get("rewind.from").map(ISODateTimeFormat.dateTime.parseDateTime)

}
