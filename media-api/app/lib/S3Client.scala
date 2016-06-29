package lib

import com.gu.mediaservice.lib.aws.S3


import com.amazonaws.services.cloudfront.CloudFrontUrlSigner
import com.amazonaws.services.cloudfront.util.SignerUtils.Protocol
import java.io.File
import java.net.URL
import org.joda.time.DateTime
import java.util.Date
import scala.concurrent.duration._
import scala.util.Try


trait CloudFrontDistributable {
  val privateKeyLocation: String
  val keyPairId: Option[String]

  val protocol: Protocol = Protocol.https
  val validForMinutes: Int = 30

  private def expiresAt: Date = DateTime.now.plusMinutes(validForMinutes).toDate()
  private lazy val privateKeyFile: File = {
    new File(privateKeyLocation)
  }

  def signedCloudFrontUrl(cloudFrontDomain: String, s3ObjectPath: String): Option[String] = Try {
    CloudFrontUrlSigner.getSignedURLWithCannedPolicy(
      protocol, cloudFrontDomain, privateKeyFile, s3ObjectPath, keyPairId.get, expiresAt)
  }.toOption
}

object S3Client extends S3(Config.awsCredentials) with CloudFrontDistributable {
  lazy val privateKeyLocation = Config.cloudFrontPrivateKeyLocation
  lazy val keyPairId          = Config.cloudFrontKeyPairId
}

