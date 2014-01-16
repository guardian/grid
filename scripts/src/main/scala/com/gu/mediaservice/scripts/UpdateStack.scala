package com.gu.mediaservice.scripts

import java.io.InputStream
import com.amazonaws.services.cloudformation.AmazonCloudFormationClient
import com.amazonaws.services.cloudformation.model.{CreateStackRequest, Parameter, UpdateStackRequest}
import com.amazonaws.services.identitymanagement.AmazonIdentityManagementClient
import com.amazonaws.services.identitymanagement.model.GetServerCertificateRequest
import com.amazonaws.services.s3.AmazonS3Client
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.UserCredentials
import com.amazonaws.auth.AWSCredentials

object UpdateStack extends StackScript {

  def run(cfnClient: AmazonCloudFormationClient, stackName: String, templateUrl: String, params: List[Parameter]) {
    cfnClient.updateStack(
      new UpdateStackRequest()
        .withCapabilities("CAPABILITY_IAM")
        .withStackName(stackName)
        .withTemplateURL(templateUrl)
        .withParameters(params: _*)
    )
    println(s"Updated stack $stackName.")
  }

}

object CreateStack extends StackScript {

  def run(cfnClient: AmazonCloudFormationClient, stackName: String, templateUrl: String, params: List[Parameter]) {
    cfnClient.createStack(
      new CreateStackRequest()
        .withCapabilities("CAPABILITY_IAM")
        .withStackName(stackName)
        .withTemplateURL(templateUrl)
        .withParameters(params: _*)
    )
    println(s"Created stack $stackName.")
  }

}

abstract class StackScript {

  def run(cfnClient: AmazonCloudFormationClient, stackName: String, templateUrl: String, params: List[Parameter])

  def apply(args: List[String]) {

    val stage = args match {
      case List(s) => s
      case _ => sys.error("Usage: UpdateStack <STAGE>")
    }

    val stackName = s"media-service-$stage"

    val credentials = UserCredentials.awsCredentials

    val cfnClient = {
      val client = new AmazonCloudFormationClient(credentials)
      client.setEndpoint("cloudformation.eu-west-1.amazonaws.com")
      client
    }

    val iamClient = new AmazonIdentityManagementClient(credentials)

    val templateUrl = uploadTemplate(credentials, stackName, getClass.getResourceAsStream("/template.json"))

    def getCertArn(certName: String): String =
      iamClient.getServerCertificate(new GetServerCertificateRequest(certName))
        .getServerCertificate.getServerCertificateMetadata.getArn

    val domainRoot =
      if (stage == "PROD") "media.***REMOVED***"
      else s"media.${stage.toLowerCase}.dev-***REMOVED***"

    val (esMinSize, esDesired) =
      if (stage == "PROD") (3,4)
      else (2, 2)

    val esMaxSize = esDesired * 2 // allows for autoscaling deploys

    val kahunaCertArn = getCertArn(domainRoot)
    val mediaApiCertArn = getCertArn(s"api.$domainRoot")
    val loaderCertArn = getCertArn(s"loader.$domainRoot")
    val cropperCertArn = getCertArn(s"cropper.$domainRoot")

    val templateParams = List(
      parameter("Stage", stage),
      parameter("MediaApiSSLCertificateId", mediaApiCertArn),
      parameter("KahunaSSLCertificateId", kahunaCertArn),
      parameter("ImageLoaderSSLCertificateId", loaderCertArn),
      parameter("CropperSSLCertificateId", cropperCertArn),
      parameter("ElasticsearchAutoscalingMinSize", esMinSize.toString),
      parameter("ElasticsearchAutoscalingMaxSize", esMaxSize.toString),
      parameter("ElasticsearchAutoscalingDesiredCapacity", esDesired.toString)
    )

    run(cfnClient, stackName, templateUrl, templateParams)
  }

  def parameter(key: String, value: String): Parameter =
    new Parameter().withParameterKey(key).withParameterValue(value)

  def uploadTemplate(credentials: AWSCredentials, stackName: String, template: InputStream): String = {
    val s3Client = new AmazonS3Client(credentials)
    val templateBucket = "media-service-cfn"
    val templateFilename = s"$stackName.json"
    s3Client.putObject(templateBucket, templateFilename, template, new ObjectMetadata)
    val url = mkS3Url(templateBucket, templateFilename, "eu-west-1")
    println(s"Uploaded CloudFormation template to $url")
    url
  }

  def mkS3Url(bucket: String, filename: String, region: String): String =
    s"https://s3-$region.amazonaws.com/$bucket/$filename"

}
