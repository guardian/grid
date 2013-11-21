package com.gu.mediaservice.lib

import java.nio.file.Paths
import java.util.Properties
import java.io.{File, FileInputStream}
import scala.collection.JavaConverters._
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}

object UserCredentials {

  def awsCredentials: AWSCredentials = {
    val path = sys.env.get("AWS_CREDENTIAL_FILE")
      .getOrElse(sys.error("Required environment variable AWS_CREDENTIAL_FILE is missing"))
    val file = Paths.get(path).toFile
    println(s"Reading AWS credentials from $path")
    val props = properties(file)
    new BasicAWSCredentials(props("AWSAccessKeyId"), props("AWSSecretKey"))
  }

  def properties(file: File): Map[String, String] = {
    val props = new Properties()
    props.load(new FileInputStream(file))
    props.asScala.toMap
  }

}
