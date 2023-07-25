package lib

import com.amazonaws.auth.PEM

import java.io.File
import java.util.Date
import com.amazonaws.services.cloudfront.CloudFrontUrlSigner
import com.amazonaws.services.cloudfront.util.SignerUtils
import com.amazonaws.services.cloudfront.util.SignerUtils.Protocol
import com.amazonaws.services.s3.model.{DeleteObjectsRequest, GetObjectRequest, MultiObjectDeleteException}
import com.gu.mediaservice.lib.aws.S3
import org.joda.time.DateTime

import java.security.PrivateKey
import scala.jdk.CollectionConverters.iterableAsScalaIterableConverter
import scala.util.Try

trait CloudFrontDistributable {
  val privateKey: PrivateKey
  val keyPairId: Option[String]

  val protocol: Protocol = Protocol.https
  val validForMinutes: Int = 30

  private def expiresAt: Date = DateTime.now.plusMinutes(validForMinutes).toDate

  def signedCloudFrontUrl(cloudFrontDomain: String, s3ObjectPath: String): Option[String] = Try {
    CloudFrontUrlSigner.getSignedURLWithCannedPolicy(
      SignerUtils.generateResourcePath(protocol, cloudFrontDomain, s3ObjectPath),
      keyPairId.get,
      privateKey,
      expiresAt
    )
  }.toOption
}

class S3Client(config: MediaApiConfig) extends S3(config) with CloudFrontDistributable {
  lazy val keyPairId: Option[String] = config.cloudFrontKeyPairId
  lazy val privateKey: PrivateKey = {
    config.cloudFrontPrivateKeyBucket.flatMap(bucket => config.cloudFrontPrivateKeyBucketKey.map { key =>
      val privateKeyStream = client.getObject(bucket, key).getObjectContent
      try {
        PEM.readPrivateKey(privateKeyStream)
      }
      finally {
        privateKeyStream.close()
      }
    }).orElse(Try(SignerUtils.loadPrivateKey("/etc/grid/ssl/private/cloudfront.pem")).toOption)
      .getOrElse(throw new RuntimeException("No private key found"))
  }

  def bulkDelete(bucket: String, keys: Seq[String]): Map[String, Boolean] = {
    try {
      client.deleteObjects(
        new DeleteObjectsRequest(bucket).withKeys(keys: _*)
      )
      keys.map { key =>
        key -> true
      }.toMap
    } catch {
      case partialFailure: MultiObjectDeleteException =>
        // TODO log partial failure
        keys.map { key =>
          key -> partialFailure.getErrors.asScala.map(_.getKey).toList.contains(key)
        }.toMap
    }

  }
}

