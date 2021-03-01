package lib

import java.io.{ByteArrayInputStream, File, FileOutputStream}
import java.net.URI
import java.nio.file.Files

import com.google.common.hash.HashingOutputStream
import com.google.common.io.ByteStreams
import com.gu.mediaservice.DeprecatedHashWrapper
import com.gu.mediaservice.lib.logging.GridLogging
import play.api.http.HeaderNames
import play.api.libs.ws.WSClient

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

case object TruncatedDownload extends Exception
case object InvalidDownload extends Exception

//TODO Revisit this logic
class Downloader(implicit ec: ExecutionContext, wsClient: WSClient) extends GridLogging {
  private val digester = DeprecatedHashWrapper.sha1()

  def download(uri: URI, file: File): Future[DigestedFile] = for {
    response <- wsClient.url(uri.toString).get()

    maybeExpectedSize = Try {
      response.header(HeaderNames.CONTENT_LENGTH).map(_.toInt)
    }
  } yield maybeExpectedSize match {
    case Success(None) =>
      logger.error(s"Missing content-length header from $uri")
      throw InvalidDownload
    case Failure(exception) =>
      logger.error(s"Bad content-length header from $uri", exception)
      throw InvalidDownload
    case Success(Some(expectedSize)) =>
      val input: java.io.InputStream = new java.io.ByteArrayInputStream(response.bodyAsBytes.toArray)

      val output = new FileOutputStream(file)
      val hashedOutput = new HashingOutputStream(digester, output)

      ByteStreams.copy(input, hashedOutput)

      val hash = hashedOutput.hash().asBytes()

      hashedOutput.close()

      val actualSize = Files.size(file.toPath)

      if (actualSize != expectedSize) {
        throw TruncatedDownload
      }

      DigestedFile(file, hash)
  }
}
