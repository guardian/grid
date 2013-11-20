package com.gu.mediaservice.scripts

import scala.io.Source
import com.amazonaws.services.cloudformation.AmazonCloudFormationClient
import com.amazonaws.services.cloudformation.model.{Parameter, UpdateStackRequest}
import com.amazonaws.services.identitymanagement.AmazonIdentityManagementClient
import com.amazonaws.services.identitymanagement.model.GetServerCertificateRequest

object UpdateStack {

  def apply(args: List[String]) {

    val stage = args match {
      case List(s) => s
      case _ => sys.error("Usage: UpdateStack <STAGE>")
    }

    val stackName = s"media-service-$stage"

    val credentials = UserCredentials.awsCredentials

    val iamClient = new AmazonIdentityManagementClient(credentials)

    val cfnClient = new AmazonCloudFormationClient(credentials)
    cfnClient.setEndpoint("cloudformation.eu-west-1.amazonaws.com")

    val template =
      Source.fromInputStream(getClass.getResourceAsStream("/template.json"), "UTF-8").getLines.mkString("\n")

    def getCertArn(certName: String): String =
      iamClient.getServerCertificate(new GetServerCertificateRequest(certName))
        .getServerCertificate.getServerCertificateMetadata.getArn

    val domainRoot =
      if (stage == "PROD") "media.***REMOVED***"
      else s"media.${stage.toLowerCase}.dev-***REMOVED***"

    val kahunaCertArn = getCertArn(domainRoot)
    val mediaApiCertArn = getCertArn(s"api.$domainRoot")
    val loaderCertArn = getCertArn(s"loader.$domainRoot")

    cfnClient.updateStack(
      new UpdateStackRequest()
        .withCapabilities("CAPABILITY_IAM")
        .withStackName(stackName)
        .withTemplateBody(template)
        .withParameters(
          new Parameter().withParameterKey("Stage").withParameterValue(stage),
          new Parameter().withParameterKey("MediaApiSSLCertificateId").withParameterValue(mediaApiCertArn),
          new Parameter().withParameterKey("KahunaSSLCertificateId").withParameterValue(kahunaCertArn),
          new Parameter().withParameterKey("ImageLoaderSSLCertificateId").withParameterValue(loaderCertArn)
        )
    )

    println(s"Updated stack $stackName.")

  }

}
