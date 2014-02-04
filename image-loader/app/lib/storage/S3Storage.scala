package lib.storage

import java.io.File
import java.net.{URI, URL}
import scala.concurrent.Future
import lib.Config
import com.gu.mediaservice.lib.aws.S3
import com.amazonaws.services.s3.model.{ObjectMetadata, PutObjectRequest}


object S3Storage extends S3(Config.awsCredentials) with StorageBackend {

  def storeImage(id: String, file: File, meta: Map[String, String] = Map.empty) =
    store(Config.imageBucket, id, file, meta)

  def storeThumbnail(id: String, file: File) = store(Config.thumbnailBucket, id, file)

}
