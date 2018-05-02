package lib.storage

import lib.ImageLoaderConfig
import com.gu.mediaservice.lib

class ImageLoaderStore(config: ImageLoaderConfig) extends lib.ImageIngestOperations(config.imageBucket, config.thumbnailBucket, config)
