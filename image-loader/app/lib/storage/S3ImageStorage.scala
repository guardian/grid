package lib.storage

import lib.Config
import com.gu.mediaservice.lib

object S3ImageStorage extends lib.S3ImageStorage(Config.imageBucket, Config.thumbnailBucket, Config.awsCredentials)
