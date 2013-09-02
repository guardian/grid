package com.gu.mediaservice

import java.io.{FileOutputStream, File}
import java.nio.file.StandardWatchEventKinds._

import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

import akka.actor.ActorSystem
import org.apache.commons.io.IOUtils


object DevImageLoader extends App {

  val imageDir = "/tmp/picdar"

  val system = ActorSystem("DevImageLoader")

  implicit val ctx: ExecutionContext = system.dispatcher

  val picdar = new Picdar()

  system.scheduler.schedule(0 seconds, 1 minute)(downloadSomeImages())

  for (events <- DirectoryWatcher.watch(imageDir, ENTRY_CREATE)) {
    events foreach (e => println(s"File created: ${e.context}"))
  }

  def downloadSomeImages() {
    for (images <- picdar.latestResults()) {
      for (PicdarImage(mmref, url) <- images) {
        println(s"Downloading image: $url")
        val outputFile = new File(imageDir, s"$mmref.jpg")
        IOUtils.copy(url.openStream, new FileOutputStream(outputFile))
        println(s"Finished downloading $url")
      }
    }
  }

}
