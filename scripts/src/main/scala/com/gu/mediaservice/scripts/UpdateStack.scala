package com.gu.mediaservice.scripts

import com.amazonaws.services.cloudformation.AmazonCloudFormationClient
import com.amazonaws.services.cloudformation.model.{CreateStackRequest, Parameter, UpdateStackRequest}
import com.amazonaws.services.identitymanagement.AmazonIdentityManagementClient
import com.amazonaws.services.identitymanagement.model.GetServerCertificateRequest
import com.amazonaws.services.s3.AmazonS3Client
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib._
import com.gu.mediaservice.lib
import com.gu.mediaservice.lib.Stack

object UpdateStack extends StackScript {

  def run(cfnClient: AmazonCloudFormationClient, stack: Stack) {
    val template = uploadTemplate(stack)
    cfnClient.updateStack(
      new UpdateStackRequest()
        .withCapabilities("CAPABILITY_IAM")
        .withStackName(stack.name)
        .withTemplateURL(template)
        .withParameters(stack.parameters: _*)
    )
    println(s"Updated stack ${stack.name}.")
  }

}

object CreateStack extends StackScript {

  def run(cfnClient: AmazonCloudFormationClient, stack: Stack) {
    val template = uploadTemplate(stack)
    cfnClient.createStack(
      new CreateStackRequest()
        .withCapabilities("CAPABILITY_IAM")
        .withStackName(stack.name)
        .withTemplateURL(template)
        .withParameters(stack.parameters: _*)
    )
    println(s"Created stack ${stack.name}")
  }

}

abstract class StackScript {

  lazy val credentials = UserCredentials.awsCredentials

  lazy val iamClient = new AmazonIdentityManagementClient(credentials)

  def apply(args: List[String]) {
    val stage: Stage = args match {
      case "PROD" :: _ => Prod
      case "TEST" :: _ => Test
      case _ => usageError("Unrecognized or missing stage (should be one of TEST or PROD)")
    }
    val stack = Stacks.mediaService(stage)
    val cfnClient = {
      val client = new AmazonCloudFormationClient(credentials)
      client.setEndpoint("cloudformation.eu-west-1.amazonaws.com")
      client
    }
    run(cfnClient, stack)
  }

  def run(cfnClient: AmazonCloudFormationClient, stack: Stack)

  def usageError(msg: String): Nothing = {
    System.err.println(msg)
    System.err.println("Usage: UpdateStack <STACK> <STAGE>")
    sys.exit(1)
  }

  def uploadTemplate(stack: Stack): String = {
    val s3Client = new AmazonS3Client(credentials)
    val templateBucket = "media-service-cfn"
    val templateFilename = s"${stack.name}.json"
    s3Client.putObject(templateBucket, templateFilename, stack.template, new ObjectMetadata)
    val url = mkS3Url(templateBucket, templateFilename, "eu-west-1")
    println(s"Uploaded CloudFormation template to $url")
    url
  }

  private def mkS3Url(bucket: String, filename: String, region: String): String =
    s"https://s3-$region.amazonaws.com/$bucket/$filename"

  object Stacks {

    /** Defines the Media Service stack for the specified stage */
    def mediaService(stage: Stage): Stack = {

      val domainRoot = stage match {
        case Prod => "media.gutools.co.uk"
        case _    => s"media.$stage.dev-gutools.co.uk".toLowerCase
      }

      val kahunaCertArn = getCertArn(domainRoot)
      val mediaApiCertArn = getCertArn(s"api.$domainRoot")
      val loaderCertArn = getCertArn(s"loader.$domainRoot")
      val cropperCertArn = getCertArn(s"cropper.$domainRoot")

      val (esMinSize, esDesired) = stage match {
        case Prod => (3, 3)
        case _    => (2, 2)
      }
      val esMaxSize = esDesired * 2 // allows for autoscaling deploys

      val imgOriginHostname = stage match {
        case Prod => "media-origin.guim.co.uk"
        case _    => s"media-origin.$stage.dev-guim.co.uk".toLowerCase
      }

      val imgEdgeHostname = stage match {
        case Prod => "media.guim.co.uk"
        case _    => s"media-origin.$stage.dev-guim.co.uk".toLowerCase
      }

      lib.Stack(
        stage,
        s"media-service-$stage",
        getClass.getResourceAsStream("/media-service.json"),
        List(
          param("Stage", stage.toString),
          param("MediaApiSSLCertificateId", mediaApiCertArn),
          param("KahunaSSLCertificateId", kahunaCertArn),
          param("ImageLoaderSSLCertificateId", loaderCertArn),
          param("CropperSSLCertificateId", cropperCertArn),
          param("ElasticsearchAutoscalingMinSize", esMinSize.toString),
          param("ElasticsearchAutoscalingMaxSize", esMaxSize.toString),
          param("ElasticsearchAutoscalingDesiredCapacity", esDesired.toString),
          param("ImageOriginHostname", imgOriginHostname),
          param("ImageEdgeHostname", imgEdgeHostname)
        )
      )
    }

    private def param(key: String, value: String): Parameter =
      new Parameter().withParameterKey(key).withParameterValue(value)

    private def getCertArn(certName: String): String =
      iamClient.getServerCertificate(new GetServerCertificateRequest(certName))
        .getServerCertificate.getServerCertificateMetadata.getArn

  }

}
