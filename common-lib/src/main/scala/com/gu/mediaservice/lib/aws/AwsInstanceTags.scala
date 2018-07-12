package com.gu.mediaservice.lib.aws

import com.amazonaws.regions.Regions
import com.amazonaws.services.ec2.{AmazonEC2, AmazonEC2ClientBuilder}
import com.amazonaws.services.ec2.model.{DescribeTagsRequest, Filter}
import com.amazonaws.util.EC2MetadataUtils
import play.Logger

import scala.collection.JavaConverters._

trait AwsInstanceTags {
  private lazy val instanceId = Option(EC2MetadataUtils.getInstanceId)

  private lazy val ec2Client: AmazonEC2 = AmazonEC2ClientBuilder.standard().withRegion(Regions.EU_WEST_1).build()

  def readTag(tagName: String): Option[String] = {
    instanceId.flatMap { id =>
      val tagsResult = ec2Client.describeTags(
        new DescribeTagsRequest().withFilters(
          new Filter("resource-type").withValues("instance"),
          new Filter("resource-id").withValues(id),
          new Filter("key").withValues(tagName)
        )
      )
      val tagValue = tagsResult.getTags.asScala.find(_.getKey == tagName).map(_.getValue)

      Logger.info(s"Fetched AWS Tag $tagName with value: $tagValue")

      tagValue
    }
  }
}