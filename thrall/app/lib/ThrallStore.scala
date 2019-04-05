package lib

import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib

class ThrallStore(imageBucket: String, thumbnailBucket: String, client: AmazonS3) extends lib.ImageIngestOperations(imageBucket, thumbnailBucket, client)
