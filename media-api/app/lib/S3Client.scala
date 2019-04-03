package lib

import java.io.File
import java.util.Date

import com.amazonaws.services.cloudfront.CloudFrontUrlSigner
import com.amazonaws.services.cloudfront.util.SignerUtils.Protocol
import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib.aws.S3
import org.joda.time.DateTime

import scala.util.Try

class S3Client(privateKeyLocation: String, keyPairId: Option[String], client: AmazonS3) extends S3(client) {
  val protocol: Protocol = Protocol.https
  val validForMinutes: Int = 30

  private def expiresAt: Date = DateTime.now.plusMinutes(validForMinutes).toDate
  private lazy val privateKeyFile: File = {
    new File(privateKeyLocation)
  }

  def signedCloudFrontUrl(cloudFrontDomain: String, s3ObjectPath: String): Option[String] = Try {
    CloudFrontUrlSigner.getSignedURLWithCannedPolicy(
      protocol, cloudFrontDomain, privateKeyFile, s3ObjectPath, keyPairId.get, expiresAt)
  }.toOption
}

