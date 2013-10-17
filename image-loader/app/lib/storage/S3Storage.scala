package lib.storage

import java.io.File
import java.net.{URI, URL}
import scala.concurrent.Future
import lib.Config
import com.gu.mediaservice.lib.aws.S3


object S3Storage extends S3(Config.awsCredentials) with StorageBackend {

  def storeImage(id: String, file: File) = store(Config.imageBucket, id, file)

  def storeThumbnail(id: String, file: File) = store(Config.thumbnailBucket, id, file)

  private def store(bucket: String, id: String, file: File): Future[URI] = Future {
    client.putObject(bucket, id, file)
    val bucketUrl = s"$bucket.$s3Endpoint"
    new URL("http", bucketUrl, s"/$id").toURI
  }
}
