package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib

class QuarantineStore(config: ImageLoaderConfig) extends lib.ImageQuarantineOperations(config.quarantineBucket.get, config, s3Endpoint = config.quarantineBucketS3Endpoint)
