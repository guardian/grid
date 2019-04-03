package lib.storage

import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib

class ImageLoaderStore(imageBucket: String, thumbnailBucket: String, client: AmazonS3)
  extends lib.ImageIngestOperations(imageBucket, thumbnailBucket, client)
