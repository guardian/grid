package lib.storage

import java.io.File
import java.net.{URL, URI}
import com.amazonaws.services.s3.{AmazonS3Client, AmazonS3}
import scalaz.syntax.id._
import lib.Config


object S3Storage extends StorageBackend {

  val s3Endpoint = "s3.eu-west-1.amazonaws.com"

  lazy val client: AmazonS3 =
    new AmazonS3Client(Config.awsCredentials) <| (_ setEndpoint s3Endpoint)

  def store(id: String, file: File): URI = {
    client.putObject(Config.s3Bucket, id, file)
    new URL("http", Config.s3Bucket + ".s3.amazonaws.com", id).toURI
  }
}
