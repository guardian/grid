package lib.storage

import java.io.File
import lib.Config
import com.gu.mediaservice.lib.aws.S3


object S3Storage extends S3(Config.awsCredentials) with StorageBackend {

  def storeImage(id: String, file: File, meta: Map[String, String] = Map.empty) =
    store(Config.imageBucket, id, file, meta)

  def storeThumbnail(id: String, file: File) = store(Config.thumbnailBucket, id, file)

}
