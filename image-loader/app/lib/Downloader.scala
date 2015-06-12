package lib

import java.io.{FileOutputStream, File}
import java.net.URI
import java.security.MessageDigest

import scala.concurrent.Future
import play.api.libs.concurrent.Execution.Implicits._

import play.api.Play.current
import play.api.libs.iteratee.Iteratee
import play.api.libs.ws.WS

import com.gu.mediaservice.lib.play.DigestedFile

case object TruncatedDownload extends Exception

object Downloader {

  def download(uri: URI, file: File): Future[DigestedFile] =
    WS.url(uri.toString).getStream().flatMap { case (responseHeaders, body) =>
      val md = MessageDigest.getInstance("SHA-1")
      val outputStream = new FileOutputStream(file)

      // The iteratee that writes to the output stream
      val iteratee = Iteratee.foreach[Array[Byte]] { bytes =>
        outputStream.write(bytes)
        md.update(bytes)
      }

      // Feed the body into the iteratee
      (body |>>> iteratee).andThen {
        case result =>
          // Close the output stream whether there was an error or not
          outputStream.close()
          // Get the result or rethrow the error
          result.get
      }.flatMap(_ =>
        responseHeaders.headers.get("Content-Length").flatMap(_.headOption) match {
          case Some(len) if file.length == len.toInt => Future.successful(DigestedFile(file, md.digest))
          case _ => Future.failed(TruncatedDownload)
        }
      )
    }

}
