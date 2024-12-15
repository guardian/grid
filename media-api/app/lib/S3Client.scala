package lib

import com.amazonaws.auth.PEM
import com.amazonaws.services.cloudfront.CloudFrontUrlSigner
import com.amazonaws.services.cloudfront.util.SignerUtils
import com.amazonaws.services.cloudfront.util.SignerUtils.Protocol
import com.gu.mediaservice.lib.aws.{RoundedExpiration, S3}

import java.security.PrivateKey
import scala.util.Try

trait CloudFrontDistributable extends RoundedExpiration{
  val privateKey: PrivateKey
  val keyPairId: Option[String]

  val protocol: Protocol = Protocol.https

  def signedCloudFrontUrl(cloudFrontDomain: String, s3ObjectPath: String): Option[String] = Try {
    CloudFrontUrlSigner.getSignedURLWithCannedPolicy(
      SignerUtils.generateResourcePath(protocol, cloudFrontDomain, s3ObjectPath),
      keyPairId.get,
      privateKey,
      cachableExpiration().toDate
    )
  }.toOption
}

class S3Client(config: MediaApiConfig) extends S3(config) with CloudFrontDistributable {
  lazy val keyPairId: Option[String] = config.cloudFrontKeyPairId
  lazy val privateKey: PrivateKey = {
    config.cloudFrontPrivateKeyBucket.flatMap(bucket => config.cloudFrontPrivateKeyBucketKey.map { key =>
      val privateKeyStream = getObject(bucket, key).getObjectContent
      try {
        PEM.readPrivateKey(privateKeyStream)
      }
      finally {
        privateKeyStream.close()
      }
    }).orElse(Try(SignerUtils.loadPrivateKey("/etc/grid/ssl/private/cloudfront.pem")).toOption)
      .getOrElse(throw new RuntimeException("No private key found"))
  }
}

