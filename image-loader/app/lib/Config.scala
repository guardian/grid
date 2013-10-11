package lib

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config.PropertiesConfig


object Config extends PropertiesConfig("image-loader") {

  lazy val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  lazy val topicArn: String = properties("sns.topic.arn")

  lazy val s3Bucket: String = properties("s3.bucket")

  lazy val tempUploadDir = properties.getOrElse("upload.tmp.dir", "/tmp")

}
