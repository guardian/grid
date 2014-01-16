package com.gu.mediaservice.scripts

import java.io.InputStream
import scala.io.Source
import com.amazonaws.services.cloudformation.AmazonCloudFormationClient
import com.amazonaws.services.cloudformation.model.{CreateStackRequest, Parameter, UpdateStackRequest}
import com.amazonaws.services.identitymanagement.AmazonIdentityManagementClient
import com.amazonaws.services.identitymanagement.model.GetServerCertificateRequest
import com.amazonaws.services.s3.AmazonS3Client
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.UserCredentials

object UpdateStack {

  def apply(args: List[String]) {
    new StackScript(args) {

      cfnClient.updateStack(
        new UpdateStackRequest()
          .withCapabilities("CAPABILITY_IAM")
          .withStackName(stackName)
          .withTemplateURL(templateUrl)
          .withParameters(
          new Parameter().withParameterKey("Stage").withParameterValue(stage),
          new Parameter().withParameterKey("MediaApiSSLCertificateId").withParameterValue(mediaApiCertArn),
          new Parameter().withParameterKey("KahunaSSLCertificateId").withParameterValue(kahunaCertArn),
          new Parameter().withParameterKey("ImageLoaderSSLCertificateId").withParameterValue(loaderCertArn),
          new Parameter().withParameterKey("CropperSSLCertificateId").withParameterValue(cropperCertArn)
        )
      )

      println(s"Updated stack $stackName.")
    }
  }

}

object CreateStack {

  def apply(args: List[String]) {
    new StackScript(args) {

      cfnClient.createStack(
        new CreateStackRequest()
          .withCapabilities("CAPABILITY_IAM")
          .withStackName(stackName)
          .withTemplateURL(templateUrl)
          .withParameters(
          new Parameter().withParameterKey("Stage").withParameterValue(stage),
          new Parameter().withParameterKey("MediaApiSSLCertificateId").withParameterValue(mediaApiCertArn),
          new Parameter().withParameterKey("KahunaSSLCertificateId").withParameterValue(kahunaCertArn),
          new Parameter().withParameterKey("ImageLoaderSSLCertificateId").withParameterValue(loaderCertArn),
          new Parameter().withParameterKey("CropperSSLCertificateId").withParameterValue(cropperCertArn)
        )
      )

      println(s"Updated stack $stackName.")
    }
  }

}

class StackScript(args: List[String]) {

  val stage = args match {
    case List(s) => s
    case _ => sys.error("Usage: UpdateStack <STAGE>")
  }

  val stackName = s"media-service-$stage"

  val credentials = UserCredentials.awsCredentials

  val iamClient = new AmazonIdentityManagementClient(credentials)

  val cfnClient = new AmazonCloudFormationClient(credentials)
  cfnClient.setEndpoint("cloudformation.eu-west-1.amazonaws.com")

  val templateUrl = uploadTemplate(stackName, getClass.getResourceAsStream("/template.json"))

  def getCertArn(certName: String): String =
    iamClient.getServerCertificate(new GetServerCertificateRequest(certName))
      .getServerCertificate.getServerCertificateMetadata.getArn

  val domainRoot =
    if (stage == "PROD") "media.***REMOVED***"
    else s"media.${stage.toLowerCase}.dev-***REMOVED***"

  val kahunaCertArn = getCertArn(domainRoot)
  val mediaApiCertArn = getCertArn(s"api.$domainRoot")
  val loaderCertArn = getCertArn(s"loader.$domainRoot")
  val cropperCertArn = getCertArn(s"cropper.$domainRoot")

  def uploadTemplate(stackName: String, template: InputStream): String = {
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
