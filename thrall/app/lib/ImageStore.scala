package lib

import com.gu.mediaservice.lib

object ImageStore extends lib.ImageIngestOperations(Config.imageBucket, Config.thumbnailBucket, Config.pngImageOpsBucket,
  Config.awsCredentials)
