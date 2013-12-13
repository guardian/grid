package lib

import java.io.File
import java.net.{URL, URI}
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3

object Storage extends S3(Config.awsCredentials) {

  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  import Config.cropBucket

  def store(id: String, file: File): Future[URI] =
    Future {
      client.putObject(cropBucket, id, file)
      val bucketUrl = s"$cropBucket.$s3Endpoint"
      new URL("http", bucketUrl, s"/$id").toURI
    }

}
