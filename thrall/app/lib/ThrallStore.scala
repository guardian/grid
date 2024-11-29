package lib

import com.gu.mediaservice.lib

class ThrallStore(config: ThrallConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config, config.isVersionedS3, config.imageBucketS3Endpoint, config.thumbnailBucketS3Endpoint)
