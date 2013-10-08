package lib

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config


object Config extends config.Config {

  private lazy val properties: Map[String, String] =
    config.Properties.fromFile("/etc/gu/image-loader.properties")

  lazy val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  lazy val topicArn: String = properties("sns.topic.arn")

  lazy val s3Bucket: String = properties("s3.bucket")

  lazy val tempUploadDir = properties.getOrElse("upload.tmp.dir", "/tmp")

}
