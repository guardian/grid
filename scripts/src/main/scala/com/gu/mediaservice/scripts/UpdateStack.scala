package com.gu.mediaservice.scripts

import com.amazonaws.services.cloudformation.AmazonCloudFormationClient
import com.amazonaws.services.cloudformation.model.{DeleteStackRequest, CreateStackRequest, Parameter, UpdateStackRequest}
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
    println(s"Updating stack ${stack.name}.")
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
    println(s"Creating stack ${stack.name}")
  }

}

object DeleteStack extends StackScript {

  def run(cfnClient: AmazonCloudFormationClient, stack: Stack) {
    val template = uploadTemplate(stack)
    cfnClient.deleteStack(
      new DeleteStackRequest()
        .withStackName(stack.name)
    )
    println(s"Deleting stack ${stack.name}")
  }

}

abstract class StackScript {

  lazy val credentials = UserCredentials.awsCredentials

  lazy val iamClient = new AmazonIdentityManagementClient(credentials)

  def apply(args: List[String]) {
    val (stage: Stage, requiredArgs: List[String]) = args match {
      case "PROD" :: xs => (Prod, xs)
      case "TEST" :: xs => (Test, xs)
      case _ => usageError("Unrecognized or missing stage (should be one of TEST or PROD)")
    }

    // TODO: Make this read from a file
    val (pandaKey, pandaSecret, mixpanelToken, sentryDsn) = requiredArgs match {
      case key :: secret :: token :: dsn :: xs => (key, secret, token, dsn)
      case _ => usageError("Missing required arguments")
    }

    val stack = Stacks.mediaService(stage, pandaKey, pandaSecret, mixpanelToken, sentryDsn)
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
    System.err.println("Usage: <CreateStack|UpdateStack> <STAGE> <PANDA_ACCESS_KEY> <PANDA_ACCESS_SECRET> <MIXPANEL_TOKEN> <SENTRY_DSN>")
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
    def mediaService(stage: Stage,
                     pandaAwsKey: String, pandaAwsSecret: String,
                     mixpanelToken: String, sentryDsn: String): Stack = {

      val parentDomain = stage match {
        case Prod => "gutools.co.uk"
        case _    => s"$stage.dev-gutools.co.uk".toLowerCase
      }
      val domainRoot = s"media.$parentDomain"

      val alertEmail = s"media-service-$stage-alerts@gupage.pagerduty.com".toLowerCase
      val alertActive = stage == Prod

      val kahunaCertArn = getCertArn(s"$parentDomain-rotated")
      val mediaApiCertArn = getCertArn(s"api.$domainRoot-rotated")
      val loaderCertArn = getCertArn(s"loader.$domainRoot-rotated")
      val cropperCertArn = getCertArn(s"cropper.$domainRoot-rotated")
      val metadataCertArn = getCertArn(s"$parentDomain-rotated")

      val (esMinSize, esDesired) = stage match {
        case Prod => (3, 3)
        case _    => (2, 2)
      }
      val esMaxSize = esDesired * 2 // allows for autoscaling deploys
      val minMasterNodes = (esMinSize / 2) + 1 // int math ftw

      val imgOriginHostname = stage match {
        case Prod => "media-origin.guim.co.uk"
        case _    => s"media-origin.$stage.dev-guim.co.uk".toLowerCase
      }

      val imgEdgeHostname = stage match {
        case Prod => "media.guim.co.uk"
        case _    => s"media-origin.$stage.dev-guim.co.uk".toLowerCase
      }

      // Only SSL in PROD (via Fastly) ;_;
      val imgEdgeSecureHostname = stage match {
        case Prod => Some("media.guim.co.uk")
        case _    => None
      }

      val corsAllowedOrigins = stage match {
        case Prod => List("https://composer.gutools.co.uk")
        case _    =>
          List("local", "code", "qa", "release").
            map(env => s"https://composer.$env.dev-gutools.co.uk")
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
          param("MetadataSSLCertificateId", metadataCertArn),
          param("ElasticsearchAutoscalingMinSize", esMinSize.toString),
          param("ElasticsearchAutoscalingMaxSize", esMaxSize.toString),
          param("ElasticsearchAutoscalingDesiredCapacity", esDesired.toString),
          param("ElasticsearchMinMasterNodes", minMasterNodes.toString),
          param("ImageOriginHostname", imgOriginHostname),
          param("ImageEdgeHostname", imgEdgeHostname),
          // Annoyingly, CloudFormation doesn't support optional parameters
          param("ImageEdgeSecureHostname", imgEdgeSecureHostname.getOrElse("")),
          param("DomainRoot", domainRoot),
          param("CorsAllowedOrigins", corsAllowedOrigins.mkString(",")),
          param("AlertEmail", alertEmail),
          param("AlertActive", alertActive.toString),
          param("PandaDomain", parentDomain),
          param("PandaAwsKey",  pandaAwsKey),
          param("PandaAwsSecret", pandaAwsSecret),
          param("MixpanelToken", mixpanelToken),
          param("SentryDsn", sentryDsn)
        )
      )
    }

    private def param(key: String, value: String): Parameter =
      new Parameter().withParameterKey(key).withParameterValue(value)

    private def paramUsePreviousValue(key: String): Parameter =
      new Parameter().withUsePreviousValue(true)

    private def param(key: String, value: Option[String]): Parameter = value match {
      case Some(value) => param(key, value)
      case None        => paramUsePreviousValue(key)
    }

    private def getCertArn(certName: String): String =
      iamClient.getServerCertificate(new GetServerCertificateRequest(certName))
        .getServerCertificate.getServerCertificateMetadata.getArn

  }

}
