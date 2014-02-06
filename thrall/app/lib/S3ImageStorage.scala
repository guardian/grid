package lib

import com.gu.mediaservice.lib

object S3ImageStorage extends lib.S3ImageStorage(Config.imageBucket, Config.thumbnailBucket, Config.awsCredentials)
