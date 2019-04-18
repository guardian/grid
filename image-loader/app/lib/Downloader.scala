package lib

import java.io.File
import java.net.URI
import java.nio.file.Files

import okhttp3.{OkHttpClient, Request}
import org.apache.commons.codec.digest.DigestUtils

import scala.concurrent.{ExecutionContext, Future}

case object TruncatedDownload extends Exception

//TODO Revisit this logic
class Downloader(implicit ec: ExecutionContext) {
  private val client = new OkHttpClient()

  def download(uri: URI, file: File): Future[DigestedFile] = Future {
    val request = new Request.Builder().url(uri.toString).build()
    val response = client.newCall(request).execute()

    val expectedSize = response.header("Content-Length").toInt
    val input = response.body().byteStream()

    // SHA-1 is deprecated cryptographically but we still use it here for backwards compatibility
    val hash = DigestUtils.sha1(input)
    input.close()

    val actualSize = Files.size(file.toPath)

    if (actualSize != expectedSize) {
      throw TruncatedDownload
    }

    DigestedFile(file, hash)
  }
}
