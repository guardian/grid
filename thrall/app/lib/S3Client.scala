package lib

import com.gu.mediaservice.lib.aws.S3

object S3Client extends S3(Config.awsCredentials) {

  def delete(key: String) {
    client.deleteObject(Config.s3Bucket, key)
  }

}
