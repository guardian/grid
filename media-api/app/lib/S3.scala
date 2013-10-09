package lib

import com.amazonaws.services.s3.{AmazonS3Client, AmazonS3}
import com.amazonaws.services.s3.model.GeneratePresignedUrlRequest
import org.joda.time.DateTime
import scalaz.syntax.id._


object S3 {

  val s3Endpoint = "s3.amazonaws.com"

  lazy val client: AmazonS3 =
    new AmazonS3Client(Config.awsCredentials) <| (_ setEndpoint s3Endpoint)

  def signUrl(bucket: String, key: String, expiration: DateTime): String = {
    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate)
    client.generatePresignedUrl(request).toExternalForm
  }

}
