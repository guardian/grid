package lib

import java.io.File
import java.net.{URL, URI}
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3

object S3Storage extends S3(Config.awsCredentials) {

  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  def store(bucket: String, id: String, file: File): Future[URI] =
    Future {
      client.putObject(bucket, id, file)
      val bucketUrl = s"$bucket.$s3Endpoint"
      new URL("http", bucketUrl, s"/$id").toURI
    }

}
