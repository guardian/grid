package com.gu.mediaservice

import java.nio.file.StandardWatchEventKinds._

import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

import akka.actor.ActorSystem
import java.nio.file.{Paths, Files, Path}


object DevImageLoader extends App {

  val imageDir = Paths.get("/tmp/picdar")

  val system = ActorSystem("DevImageLoader")

  implicit val ctx: ExecutionContext = system.dispatcher

  val picdar = new Picdar()

  system.scheduler.schedule(0 seconds, 1 minute)(downloadSomeImages())

  for (event <- DirectoryWatcher.watch(imageDir, ENTRY_CREATE).deChunk) {
    println(s"File created: ${event.context}")
  }

  def downloadSomeImages() {
    withTempDir("dev-image-loader") { tempDir =>
      for (images <- picdar.latestResults()) {
        for (PicdarImage(mmref, url) <- images) {
          val downloadPath = tempDir.resolve(s"$mmref.jpg")
          println(s"Downloading image from $url to $downloadPath")
          Files.copy(url.openStream, downloadPath)
          println(s"Finished downloading $url")
          val finalPath = imageDir.resolve(s"$mmref.jpg")
          Files.move(downloadPath, finalPath)
          println(s"Moved $downloadPath to $finalPath")
        }
      }
    }
  }

  def withTempDir[A](parent: String)(f: Path => A): A = {
    val tempDir = Files.createTempDirectory(parent)
    println(s"Created temporary dir $tempDir")
    f(tempDir)
  }

}
