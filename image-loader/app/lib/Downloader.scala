package lib

import java.io.{File, FileOutputStream}
import java.net.URI
import java.security.MessageDigest

import akka.Done
import akka.stream.Materializer
import akka.stream.scaladsl.{Sink, Source}
import com.gu.mediaservice.lib.play.DigestedFile
import play.api.libs.streams.Accumulator
import play.api.libs.ws.WSClient

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

case object TruncatedDownload extends Exception

//TODO Revisit this logic
class Downloader(wsClient: WSClient, implicit val mat: Materializer) {

  def download(uri: URI, file: File): Future[DigestedFile] =
    wsClient.url(uri.toString).stream().flatMap { response =>
      val md = MessageDigest.getInstance("SHA-1")
      val outputStream = new FileOutputStream(file)

      // The accumulator that writes to the output stream
      val accumulator: Accumulator[Array[Byte], Done] = Accumulator(Sink.foreach[Array[Byte]] { bytes =>
        outputStream.write(bytes)
        md.update(bytes)
      })

      val source: akka.stream.scaladsl.Source[Array[Byte], _] = Source(scala.collection.immutable.Iterable(response.body.toCharArray.map(_.toByte)))
      // Feed the body into the accumulator
      accumulator.run(source).andThen {
        case result =>
          // Close the output stream whether there was an error or not
          outputStream.close()
          // Get the result or rethrow the error
          result
      }.flatMap(_ =>
        response.headers.get("Content-Length").flatMap(_.headOption) match {
          case Some(len) if file.length == len.toInt => Future.successful(DigestedFile(file, md.digest))
          case _ => Future.failed(TruncatedDownload)
        }
      )
    }

}
