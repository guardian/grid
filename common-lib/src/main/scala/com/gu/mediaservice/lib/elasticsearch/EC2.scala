package com.gu.mediaservice.lib.elasticsearch

import com.amazonaws.services.ec2.AmazonEC2
import com.amazonaws.services.ec2.model.{DescribeInstancesRequest, Filter, InstanceStateName}
import com.gu.mediaservice.lib.Logging

import scala.collection.JavaConverters._
import scala.util.Random

object EC2 extends Logging {

  @annotation.tailrec
  def findElasticsearchHost(client: AmazonEC2, tags: Map[String, Seq[String]]): String = {
    val instances = client.describeInstances(new DescribeInstancesRequest().withFilters(
      new Filter("instance-state-name", List(InstanceStateName.Running.toString).asJava) +:
      tagFilters(tags): _*
    ))

    val hosts = instances.getReservations.asScala
      .flatMap(_.getInstances.asScala)
      .map(_.getPublicDnsName)
    Logger.info(s"Available Elasticsearch hosts in EC2: [${hosts.mkString(", ")}]")

    Random.shuffle(hosts).headOption match {
      case None =>
        Logger.warn("Could not find an Elasticsearch host. Trying again...")
        Thread.sleep(1000)
        findElasticsearchHost(client, tags)
      case Some(host) =>
        Logger.info(s"Using Elasticsearch host $host")
        host
    }
  }

  def tagFilters(tags: Map[String, Seq[String]]): List[Filter] =
    for ((key, values) <- tags.toList) yield new Filter(s"tag:$key", values.asJava)

}
