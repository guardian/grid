package com.gu.mediaservice

import java.io.File
import java.net.{URLEncoder, URL}
import java.nio.file.StandardWatchEventKinds._
import java.nio.file.{Paths, Files, Path}

import scala.concurrent.{Await, Future, ExecutionContext}
import scala.concurrent.duration._

import akka.actor.ActorSystem
import play.api.libs.ws.{WS, Response}


object DevImageLoader {

  val imageDir = Paths.get("/tmp/picdar")

  val system = ActorSystem("DevImageLoader")

  implicit val ctx: ExecutionContext = system.dispatcher

  val picdar = new Picdar()

  def main(args: Array[String]) {
    system.scheduler.schedule(0 seconds, 1 minute)(downloadSomeImages())
    indexDownloadedImages()
  }

  def indexDownloadedImages() {
    DirectoryWatcher.watch(imageDir, ENTRY_CREATE) { event =>
      val id = event.context.getFileName.toString
      val path = imageDir.resolve(event.context.getFileName)
      Await.ready(putImage(id, path.toFile), 10.seconds)
    }
  }

  def downloadSomeImages() {
    withTempDir("dev-image-loader") { tempDir =>
      for (images <- picdar.latestResults(10)) yield {
        for (PicdarImage(mmref, url) <- images) {
          val downloadPath = tempDir.resolve(s"$mmref")
          println(s"Downloading image from $url to $downloadPath")
          Files.copy(url.openStream, downloadPath)
          println(s"Finished downloading $url")
          val finalPath = imageDir.resolve(s"$mmref")
          Files.move(downloadPath, finalPath)
          println(s"Moved $downloadPath to $finalPath")
        }
      }
    }
  }

  def withTempDir[A](parent: String)(f: Path => Future[A]): Future[A] = {
    val tempDir = Files.createTempDirectory(parent)
    println(s"Created temporary dir $tempDir")
    val future = f(tempDir)
    future.onComplete { _ =>
      Files.delete(tempDir)
      println(s"Deleted temporary dir $tempDir")
    }
    future
  }

  val apiImageUriBase = "http://localhost:9000/image/"

  def putImage(id: String, file: File): Future[Response] = {
    val url = apiImageUriBase + URLEncoder.encode(id, "utf8")
    println(s"PUT ${file.getAbsolutePath} to $url")
    WS.url(url).withHeaders("Content-Type" -> "image/jpeg").put(file)
  }

}
