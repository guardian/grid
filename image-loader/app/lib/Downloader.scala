package lib

import java.io.{ByteArrayInputStream, File, FileOutputStream}
import java.net.URI
import java.nio.file.Files
import com.google.common.hash.HashingOutputStream
import com.google.common.io.ByteStreams
import com.gu.mediaservice.DeprecatedHashWrapper
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import play.api.http.HeaderNames
import play.api.libs.ws.WSClient

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

case object TruncatedDownload extends Exception
case object InvalidDownload extends Exception

//TODO Revisit this logic
class Downloader(implicit ec: ExecutionContext, wsClient: WSClient) extends GridLogging {
  private val digester = DeprecatedHashWrapper.sha1()

  def download(inputStream: java.io.InputStream, destinationFile: File, expectedSize: Long): DigestedFile = {

    val output = new FileOutputStream(destinationFile)
    val hashedOutput = new HashingOutputStream(digester, output)

    ByteStreams.copy(inputStream, hashedOutput)

    val hash = hashedOutput.hash().asBytes()

    hashedOutput.close()

    val actualSize = Files.size(destinationFile.toPath)

    if (actualSize != expectedSize) {
      throw TruncatedDownload
    }

    DigestedFile(destinationFile, hash)
  }

  def download(uri: URI, file: File)(implicit logMarker: LogMarker): Future[DigestedFile] = for {
    response <- wsClient.url(uri.toString).get()

    maybeExpectedSize = Try {
      response.header(HeaderNames.CONTENT_LENGTH).map(_.toLong)
    }
  } yield maybeExpectedSize match {
    case Success(None) =>
      logger.error(logMarker, s"Missing content-length header from $uri")
      throw InvalidDownload
    case Failure(exception) =>
      logger.error(logMarker, s"Bad content-length header from $uri", exception)
      throw InvalidDownload
    case Success(Some(expectedSize)) =>
      val inputStream: java.io.InputStream = new java.io.ByteArrayInputStream(response.bodyAsBytes.toArray)
      download(inputStream, file, expectedSize)
  }
}
