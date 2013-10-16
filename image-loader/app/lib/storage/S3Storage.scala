package lib.storage

import java.io.File
import java.net.URL
import scala.concurrent.Future
import lib.Config
import com.gu.mediaservice.lib.aws.S3


object S3Storage extends S3(Config.awsCredentials) with StorageBackend {

  val bucketUrl = s"${Config.s3Bucket}.$s3Endpoint"

  def store(id: String, file: File) = Future {
    client.putObject(Config.s3Bucket, id, file)
    new URL("http", bucketUrl, s"/$id").toURI
  }
}
