package com.gu.mediaservice.integration

import scala.collection.JavaConverters._
import com.amazonaws.services.cloudformation.model.{Stack, DescribeStacksRequest}
import com.amazonaws.services.cloudformation.AmazonCloudFormationClient
import com.amazonaws.auth.BasicAWSCredentials
import scalaz.syntax.id._
import java.net.URL


object Discovery {

  lazy val integrationCredentials =
    new BasicAWSCredentials("AKIAIEB7ELXMY4LPI7UQ", "+/3Ck8cJHMWL2HTpztDJMkgsFWcvqt1XIiSPUOOa")

  private lazy val client =
    new AmazonCloudFormationClient(integrationCredentials) <| (_ setEndpoint "cloudformation.eu-west-1.amazonaws.com")

  def discoverConfig(stackName: String): Option[Config] = {
      val result = client.describeStacks(new DescribeStacksRequest().withStackName(stackName))
      for {
        stack     <- result.getStacks.asScala.headOption
        apiDns    <- findOutput("MediaApiLoadBalancer", stack)
        loaderDns <- findOutput("ImageLoaderLoadBalancer", stack)
        apiUrl    = new URL("https", apiDns, "/")
        loaderUrl = new URL("https", loaderDns, "/")
      } yield Config(loaderUrl, apiUrl)
  }

  def findOutput(key: String, stack: Stack): Option[String] =
    stack.getOutputs.asScala.collectFirst { case o if o.getOutputKey == key => o.getOutputValue }

}
