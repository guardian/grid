package lib

import java.io.File
import java.util.Date

import com.amazonaws.services.cloudfront.CloudFrontUrlSigner
import com.amazonaws.services.cloudfront.util.SignerUtils.Protocol
import com.gu.mediaservice.lib.aws.S3
import org.joda.time.DateTime

import scala.util.Try

trait CloudFrontDistributable {
  val privateKeyLocations: Seq[String]
  val keyPairId: Option[String]

  val protocol: Protocol = Protocol.https
  val validForMinutes: Int = 30

  private def expiresAt: Date = DateTime.now.plusMinutes(validForMinutes).toDate
  private lazy val privateKeyFile: File =
    privateKeyLocations.map { location =>
      new File(location)
    }.find(_.exists).get

  def signedCloudFrontUrl(cloudFrontDomain: String, s3ObjectPath: String): Option[String] = Try {
    CloudFrontUrlSigner.getSignedURLWithCannedPolicy(
      protocol, cloudFrontDomain, privateKeyFile, s3ObjectPath, keyPairId.get, expiresAt)
  }.toOption
}

class S3Client(config: MediaApiConfig) extends S3(config) with CloudFrontDistributable {
  lazy val privateKeyLocations: Seq[String] = config.cloudFrontPrivateKeyLocations
  lazy val keyPairId: Option[String] = config.cloudFrontKeyPairId
}

