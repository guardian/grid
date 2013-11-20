package com.gu.mediaservice.scripts

import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import java.nio.file.Paths
import com.gu.mediaservice.lib.config.Properties


object UserCredentials {

  def awsCredentials: AWSCredentials = {
    val path = sys.env.get("AWS_CREDENTIAL_FILE")
      .getOrElse(sys.error("Required environment variable AWS_CREDENTIAL_FILE is missing"))
    val file = Paths.get(path).toFile
    println(s"Reading AWS credentials from $path")
    val props = Properties.fromFile(file)
    new BasicAWSCredentials(props("AWSAccessKeyId"), props("AWSSecretKey"))
  }

}
