package com.gu.mediaservice.lib.discovery

import software.amazon.awssdk.services.ec2.Ec2Client
import software.amazon.awssdk.services.ec2.model.{DescribeInstancesRequest, Filter, InstanceStateName}
import com.gu.mediaservice.lib.logging.GridLogging

import scala.jdk.CollectionConverters._
import scala.util.Random

object EC2 extends GridLogging {

  @annotation.tailrec
  def findElasticsearchHostByTags(client: Ec2Client, tags: Map[String, Seq[String]]): String = {
    val instances = client.describeInstances(DescribeInstancesRequest.builder().filters(
      Filter.builder().name("instance-state-name").values(InstanceStateName.RUNNING.toString).build() +:
        tagFilters(tags): _*
    ).build())

    val hosts = instances.reservations().asScala
      .flatMap(_.instances().asScala)
      .map(_.publicDnsName())
    logger.info(s"Available Elasticsearch hosts in EC2: [${hosts.mkString(", ")}]")

    Random.shuffle(hosts).headOption match {
      case None =>
        logger.warn("Could not find an Elasticsearch host. Trying again...")
        Thread.sleep(1000)
        findElasticsearchHostByTags(client, tags)
      case Some(host) =>
        logger.info(s"Using Elasticsearch host $host")
        host
    }
  }

  def tagFilters(tags: Map[String, Seq[String]]): List[Filter] =
    for ((key, values) <- tags.toList) yield Filter.builder().name(s"tag:$key").values(values.asJava).build()

}
