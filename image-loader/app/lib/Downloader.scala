package lib

import java.io.{File, FileOutputStream}
import java.net.URI
import java.nio.file.Files

import com.google.common.hash.HashingOutputStream
import com.google.common.io.ByteStreams
import com.gu.mediaservice.DeprecatedHashWrapper
import okhttp3.{OkHttpClient, Request}

import scala.concurrent.{ExecutionContext, Future}

case object TruncatedDownload extends Exception

//TODO Revisit this logic
class Downloader(implicit ec: ExecutionContext) {
  private val client = new OkHttpClient()
  private val digester = DeprecatedHashWrapper.sha1()

  def download(uri: URI, file: File): Future[DigestedFile] = Future {
    val request = new Request.Builder().url(uri.toString).build()
    val response = client.newCall(request).execute()

    val expectedSize = response.header("Content-Length").toInt
    val input = response.body().byteStream()

    val output = new FileOutputStream(file)
    val hashedOutput = new HashingOutputStream(digester, output)

    ByteStreams.copy(input, hashedOutput)

    val hash = hashedOutput.hash().asBytes()

    input.close()
    hashedOutput.close()

    val actualSize = Files.size(file.toPath)

    if (actualSize != expectedSize) {
      throw TruncatedDownload
    }

    DigestedFile(file, hash)
  }
}
