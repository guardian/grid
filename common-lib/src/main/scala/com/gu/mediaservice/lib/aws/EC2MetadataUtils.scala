package com.gu.mediaservice.lib.aws

import software.amazon.awssdk.imds.Ec2MetadataClient

import scala.util.Using

object EC2MetadataUtils {

  def getInstanceId: Option[String] = Using(Ec2MetadataClient.create()) { client =>
    client.get("/latest/meta-data/instance-id").asString()
  }.toOption

}
