package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib
import _root_.lib.DigestedFile

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config) {

  def addFileToIngestBucket(digestedFile:DigestedFile) = {
    client.putObject(config.ingestBucket, digestedFile.digest, digestedFile.file)
  }
}

