package lib

import com.gu.mediaservice.lib.aws.S3


import com.amazonaws.services.cloudfront.CloudFrontUrlSigner
import com.amazonaws.services.cloudfront.CloudFrontUrlSigner.Protocol
import java.io.File
import java.net.URL
import org.joda.time.DateTime
import java.util.Date
import scala.concurrent.duration._

trait CloudFrontDistributable {
  val privateKeyLocation: String
  val keyPairId: String

  val protocol: Protocol = Protocol.https
  val validForMinutes: Int = 30

  private def expiresAt: Date = DateTime.now.plusMinutes(validForMinutes).toDate()
  private val privateKeyFile: File = new File(privateKeyLocation)

  def signedCloudFrontUrl(cloudFrontDomain: String, s3ObjectPath: String): String =
    CloudFrontUrlSigner.getSignedURLWithCannedPolicy(
      protocol, cloudFrontDomain, privateKeyFile, s3ObjectPath, keyPairId, expiresAt)

}

object S3Client extends S3(Config.awsCredentials) with CloudFrontDistributable {
  val privateKeyLocation = Config.cloudFrontPrivateKeyLocation
  val keyPairId          = Config.cloudFrontKeyPairId
}

